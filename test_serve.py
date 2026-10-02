"""usage.json against synthetic stores shaped like the ones PokeTokenBar v2.5.5 reads. Run: python3 -m unittest test_serve"""
import importlib
import json
import os
import re
import sqlite3
import tempfile
import time
import unittest
import zlib
from unittest import mock

import serve

APPLE_EPOCH = 978307200
T0 = time.mktime((2026, 9, 28, 14, 20, 0, 0, 0, -1))
T1 = T0 + 3 * 3600
T2 = T0 + 26 * 3600


def hour(t):
    return time.strftime('%Y-%m-%dT%H', time.localtime(t))


def iso(t):
    return time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime(t))


def entry(id, t, input=0, output=0, cache_write=0, cache_read=0):
    """A LocalUsageReader.Entry as JSONEncoder writes it."""
    return {'id': id, 'date': t - APPLE_EPOCH, 'localDay': time.strftime('%Y-%m-%d', time.localtime(t)), 'model': 'm',
            'input': input, 'output': output, 'cacheWrite': cache_write, 'cacheRead': cache_read}


def vector(input, cached, output, total):
    return {'input': input, 'cachedInput': cached, 'cacheWriteInput': 0, 'output': output, 'reasoningOutput': 0, 'total': total}


def codex_event(file, turn, t, last, cumulative, session):
    """A CodexUsageEvent: the turn as parseCodexLine maps it, with its usage state."""
    tokens = entry(f'codex|{file}|{turn}', t, input=last['input'] - last['cachedInput'], output=last['output'], cache_read=last['cachedInput'])
    return {'entry': tokens, 'usageState': {'cumulative': cumulative, 'last': last}, 'sessionID': session}


def varint(n):
    out = b''
    while True:
        byte, n = n & 0x7f, n >> 7
        if not n:
            return out + bytes([byte])
        out += bytes([byte | 0x80])


def pb(field, value):
    """One protobuf field: an int as a varint, bytes or str as length-delimited."""
    if isinstance(value, int):
        return varint(field << 3) + varint(value)
    value = value.encode() if isinstance(value, str) else value
    return varint(field << 3 | 2) + varint(len(value)) + value


def database(path, *statements):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with sqlite3.connect(path) as db:
        for sql, *rows in statements:
            if rows:
                db.executemany(sql, rows)
            else:
                db.execute(sql)
    db.close()


class UsageTest(unittest.TestCase):
    def setUp(self):
        importlib.reload(serve)
        self.home = tempfile.TemporaryDirectory()
        self.addCleanup(self.home.cleanup)
        home = self.home.name
        app = os.path.join(home, 'Library/Application Support/PokeTokenBar')
        os.makedirs(app)
        serve.HOME, serve.APP_DIR = home, app
        serve.SAVE = os.path.join(app, 'companion-state.json')
        serve.USAGE = os.path.join(app, 'usage-cache.json')
        serve.CURSOR_API = os.path.join(app, 'cursor-usage-api-cache.json')
        serve.PREFS = os.path.join(home, 'Library/Preferences/io.github.chattymin.poketokenbar.plist')
        names = ('OPENCODE_DATA_DIR', 'HERMES_HOME', 'COPILOT_HOME', 'CURSOR_DATA_DIR', 'KIRO_CLI_HOME', 'KIRO_HOME')
        patcher = mock.patch.dict(os.environ, {k: v for k, v in os.environ.items() if k not in names}, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.write_cache()

    def path(self, *parts):
        return os.path.join(self.home.name, *parts)

    def write_cache(self, **providers):
        """usage-cache.json as LocalUsageCache saves it: the Snapshot, raw-deflated like NSData's .zlib."""
        snapshot = {'claude': {}, 'codex': {}, 'codexSessionIDs': {}, 'gemini': {}, 'grok': {}, 'pi': {}, 'omp': {},
                    'claudeParserVersion': 1, 'codexParserVersion': 6, 'codexSessionIndexVersion': 2,
                    'grokParserVersion': 2, 'piParserVersion': 3, 'ompParserVersion': 2}
        snapshot.update(providers)
        deflate = zlib.compressobj(wbits=-15)
        with open(serve.USAGE, 'wb') as f:
            f.write(deflate.compress(json.dumps(snapshot).encode()) + deflate.flush())

    def usage(self):
        return json.loads(serve.usage_body()[0])

    def test_claude_keeps_the_largest_copy_of_a_turn_at_its_earliest_time(self):
        blob = lambda *entries: {'mtime': 0, 'size': 0, 'entries': list(entries)}
        self.write_cache(claude={
            '/p/a.jsonl': blob(entry('m1|r1', T1, input=10, output=5)),
            '/p/b.jsonl': blob(entry('m1|r1', T0, input=10, output=90), entry('m2|r2', T1, cache_read=7)),
        })
        self.assertEqual(self.usage()['hours'], {hour(T0): 100, hour(T1): 7})

    def test_codex_counts_a_fork_without_the_turns_it_replays_from_its_parent(self):
        c1, c2 = vector(100, 40, 10, 110), vector(250, 90, 30, 280)
        parent = {'path': '/s/parent.jsonl', 'sessionID': 'p1', 'isSubagent': False, 'events': [
            codex_event('parent.jsonl', 0, T0, vector(100, 40, 10, 110), c1, 'p1'),
            codex_event('parent.jsonl', 1, T0 + 60, vector(150, 50, 20, 170), c2, 'p1')]}
        total_only = vector(0, 0, 0, 500)
        child = {'path': '/s/child.jsonl', 'sessionID': 'c1', 'parentSessionID': 'p1', 'forkedAt': T1 - APPLE_EPOCH, 'isSubagent': False, 'events': [
            codex_event('child.jsonl', 0, T1, vector(100, 40, 10, 110), c1, 'p1'),
            codex_event('child.jsonl', 1, T1 + 5, vector(150, 50, 20, 170), c2, 'p1'),
            codex_event('child.jsonl', 2, T1 + 60, vector(60, 20, 5, 65), vector(310, 110, 35, 345), 'c1'),
            codex_event('child.jsonl', 3, T2, total_only, vector(310, 110, 35, 845), 'c1')]}
        blob = lambda rollout: {'mtime': 0, 'size': 0, 'rollout': rollout}
        self.write_cache(codex={'/s/parent.jsonl': blob(parent), '/s/child.jsonl': blob(child)})
        self.assertEqual(self.usage()['hours'], {hour(T0): 110 + 170, hour(T1): 65, hour(T2): 500})

    def test_antigravity_dates_a_record_by_its_own_stamp_or_by_its_step(self):
        usage = lambda input, output, cache_read, response: pb(4, pb(2, input) + pb(3, output) + pb(5, cache_read) + pb(11, response))
        stamped = pb(1, usage(100, 50, 30, 'r1') + pb(9, pb(4, pb(1, int(T0)))) + pb(19, 'model'))
        undated = pb(1, usage(20, 10, 0, 'r2') + pb(9, b'')) + pb(4, 'exec-1')
        step = pb(8, pb(1, int(T1))) + pb(9, pb(11, 'r2')) + pb(12, 'exec-1')
        first, second = (pb(1, usage(n, n, 0, f'x{n}') + pb(9, b'')) + pb(4, 'exec-2') for n in (5, 1))
        steps = pb(1, pb(1, int(T2))) + pb(12, 'exec-2'), pb(8, pb(1, int(T2 + 3600))) + pb(12, 'exec-2')
        database(self.path('.gemini/antigravity/conversations/conv.db'),
                 ('CREATE TABLE gen_metadata (idx INTEGER, data BLOB)',),
                 ('CREATE TABLE steps (idx INTEGER, metadata BLOB)',),
                 ('INSERT INTO gen_metadata VALUES (?, ?)', (0, stamped), (1, undated), (2, first), (3, second)),
                 ('INSERT INTO steps VALUES (?, ?)', (0, step), (1, steps[0]), (2, steps[1])))
        self.assertEqual(self.usage()['hours'], {hour(T0): 180, hour(T1): 30, hour(T2): 10, hour(T2 + 3600): 2})

    def test_opencode_reads_both_message_tables_and_legacy_files(self):
        v2 = {'tokens': {'input': 100, 'output': 20, 'reasoning': 5, 'cache': {'read': 300, 'write': 10}}, 'model': {'id': 'm', 'providerID': 'p'}}
        v1 = {'id': 'msg-1', 'tokens': {'input': 10, 'output': 10, 'total': 50, 'cache': {'read': 0, 'write': 0}}, 'time': {'created': T1 * 1000}, 'modelID': 'm', 'providerID': 'p'}
        database(self.path('.local/share/opencode/opencode.db'),
                 ('CREATE TABLE session_message (id TEXT, type TEXT, time_created INTEGER, data TEXT)',),
                 ('CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT)',),
                 ('INSERT INTO session_message VALUES (?, ?, ?, ?)', ('sm-1', 'assistant', int(T0 * 1000), json.dumps(v2)), ('sm-2', 'user', int(T0 * 1000), json.dumps(v2))),
                 ('INSERT INTO message VALUES (?, ?, ?, ?)', ('row-1', 's', int(T1 * 1000), json.dumps(v1))))
        legacy = self.path('.local/share/opencode/storage/message/ses_1/msg-2.json')
        os.makedirs(os.path.dirname(legacy))
        with open(legacy, 'w') as f:
            json.dump({**v1, 'id': 'msg-2', 'time': {'created': T2}}, f)
        self.assertEqual(self.usage()['hours'], {hour(T0): 435, hour(T1): 50, hour(T2): 50})

    def test_hermes_counts_a_session_at_its_start(self):
        database(self.path('.hermes/state.db'),
                 ('CREATE TABLE sessions (id TEXT, model TEXT, billing_provider TEXT, started_at REAL, message_count INTEGER, input_tokens INTEGER, output_tokens INTEGER,'
                  ' cache_read_tokens INTEGER, cache_write_tokens INTEGER, reasoning_tokens INTEGER, estimated_cost_usd REAL, actual_cost_usd REAL)',),
                 ('INSERT INTO sessions VALUES (?, ?, NULL, ?, 3, ?, ?, ?, ?, ?, NULL, NULL)', ('s1', 'm', T0, 100, 20, 300, 10, 5), ('s2', ' ', T1, 999, 0, 0, 0, 0)))
        self.assertEqual(self.usage()['hours'], {hour(T0): 435})

    def test_cursor_takes_the_api_events_and_the_local_bubbles_outside_their_window(self):
        with open(serve.CURSOR_API, 'w') as f:
            json.dump({'fetchedAt': T2 - APPLE_EPOCH, 'accountIdentifier': 'subject:x', 'coveredSince': T1 - APPLE_EPOCH,
                       'entries': [entry('cursor|api|e1', T1, input=100, output=20, cache_read=1000)]}, f)
        bubble = lambda t, input, output: json.dumps({'tokenCount': {'inputTokens': input, 'outputTokens': output}, 'createdAt': iso(t)}).encode()
        database(self.path('Library/Application Support/Cursor/User/globalStorage/state.vscdb'),
                 ('CREATE TABLE cursorDiskKV (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)',),
                 ('INSERT INTO cursorDiskKV VALUES (?, ?)', ('bubbleId:a:1', bubble(T0, 40, 2)), ('bubbleId:a:2', bubble(T1 + 60, 7, 7)), ('composerData:a', b'{}')))
        self.assertEqual(self.usage()['hours'], {hour(T0): 42, hour(T1): 1120})

    def test_copilot_takes_cached_tokens_out_of_the_prompt(self):
        database(self.path('.copilot/session-store.db'),
                 ('CREATE TABLE assistant_usage_events (id INTEGER PRIMARY KEY AUTOINCREMENT, model TEXT, input_tokens INTEGER, output_tokens INTEGER,'
                  ' cache_read_tokens INTEGER, cache_write_tokens INTEGER, reasoning_tokens INTEGER, created_at TEXT)',),
                 ('INSERT INTO assistant_usage_events (model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                  ('m', 1000, 50, 600, 100, 20, iso(T0)), ('m', 10, 5, 0, 0, 0, time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(T1)))))
        self.assertEqual(self.usage()['hours'], {hour(T0): 1050, hour(T1): 15})

    def test_kiro_estimates_a_turn_from_the_history_it_resends(self):
        turn = lambda user, assistant, t, response: {'user': {'content': user, 'images': 'x' * 400}, 'assistant': assistant,
                                                     'request_metadata': {'request_start_timestamp_ms': int(t * 1000), 'response_size': response}}
        conversation = {'conversation_id': 'c1', 'history': [turn('a' * 40, 'b' * 80, T0, 80), turn('c' * 20, 'd' * 8, T1, 8)]}
        database(self.path('Library/Application Support/kiro-cli/data.sqlite3'),
                 ('CREATE TABLE conversations_v2 (conversation_id TEXT, value TEXT)',),
                 ('INSERT INTO conversations_v2 VALUES (?, ?)', ('c1', json.dumps(conversation))))
        cli = self.path('.kiro/sessions/cli/s1.jsonl')
        os.makedirs(os.path.dirname(cli))
        with open(cli, 'w') as f:
            for kind, content, t in (('Prompt', 'e' * 40, T2), ('AssistantMessage', 'f' * 20, None), ('ToolResults', 'g' * 8, None)):
                data = {'content': [{'kind': 'text', 'data': content}]}
                if t:
                    data['meta'] = {'timestamp': int(t)}
                f.write(json.dumps({'version': 1, 'kind': kind, 'data': data}) + '\n')
        v3 = self.path('.kiro/sessions/workspace/s2/messages.jsonl')
        os.makedirs(os.path.dirname(v3))
        with open(v3, 'w') as f:
            for event in ({'timestamp': iso(T1 + 120), 'payload': {'type': 'user', 'content': 'h' * 16}}, {'payload': {'type': 'assistant', 'content': 'i' * 8}},
                          {'payload': {'type': 'tool_call', 'args': 'j' * 4}}, {'payload': {'type': 'tool_result', 'content': 'k' * 4}},
                          {'payload': {'type': 'turn_end'}}, {'role': 'user', 'content': 'l' * 8, 'timestamp': iso(T2 + 60)}, {'role': 'assistant', 'content': 'm' * 4}):
                f.write(json.dumps(event) + '\n')
        # latest_summary is absent, so the running history starts at len("0") = 1 byte, as the app counts it.
        self.assertEqual(self.usage()['hours'], {hour(T0): 10 + 20, hour(T1): 35 + 2 + 5 + 3, hour(T2): 12 + 5 + 10 + 1})

    def test_aside_counts_a_turn_at_its_last_activity(self):
        database(self.path('.aside/u/user1/state.db'),
                 ('CREATE TABLE sessions (id INTEGER PRIMARY KEY, model TEXT)',),
                 ('CREATE TABLE session_turns (id INTEGER PRIMARY KEY, session_id INTEGER, token_usage TEXT, finished_at REAL, last_message_timestamp REAL)',),
                 ('INSERT INTO sessions VALUES (?, ?)', (1, json.dumps({'modelId': 'm'}))),
                 ('INSERT INTO session_turns VALUES (?, ?, ?, ?, ?)',
                  (1, 1, json.dumps({'input': 100, 'output': 20, 'cacheRead': 300, 'cacheWrite': 0}), T1, T0),
                  (2, 1, json.dumps({'totalTokens': 70}), None, T2),
                  (3, 1, json.dumps({'input': 0, 'output': 0}), T2, T2)))
        self.assertEqual(self.usage()['hours'], {hour(T1): 420, hour(T2): 70})

    def test_sources_name_what_is_counted_and_what_grew_the_pokemon_unseen(self):
        now = time.time()
        self.write_cache(claude={'/p/a.jsonl': {'mtime': 0, 'size': 0, 'entries': [entry('m1|r1', now, input=10)]}})
        with open(serve.SAVE, 'w') as f:
            json.dump({'lastDate': time.strftime('%Y-%m-%d'), 'claimedTodayTokensByProvider': {'claude_code': 10, 'windsurf': 5, 'codex': 0}}, f)
        self.assertEqual(self.usage()['sources'], [{'id': 'claude_code', 'counted': True}, {'id': 'windsurf', 'counted': False}])

    def test_both_readmes_name_every_provider_read(self):
        names = {'claude_code': 'Claude Code', 'codex': 'Codex', 'gemini': 'Gemini', 'grok': 'Grok', 'pi': 'Pi', 'omp': 'OMP', 'antigravity': 'Antigravity',
                 'opencode': 'OpenCode', 'hermes': 'Hermes', 'cursor': 'Cursor', 'copilot': 'Copilot', 'kiro': 'Kiro', 'aside': 'Aside'}
        providers = sorted({p for _, read, _ in serve.usage_sources() for p in read})
        for readme in ('README.md', 'README.fr.md'):
            with open(os.path.join(serve.HERE, readme)) as f:
                text = f.read()
            self.assertEqual([p for p in providers if not re.search(rf'\b{re.escape(names.get(p, p))}\b', text)], [], readme)


if __name__ == '__main__':
    unittest.main()
