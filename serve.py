#!/usr/bin/env python3
"""Serves TokenDex on http://127.0.0.1:8649: the pages built in dist/ by `npm run build`.
`--open` also opens them in the browser, or only that when TokenDex is already running.

Live data, read from the app on every request:
  /save.json      the app's companion-state.json
  /usage.json     tokens per local hour from every store the app counts, and which providers that covers
                  (counts only, no prompts or model names)
  /settings.json  the growth and shop sliders of the app
  /egg-purchases.json  each egg bought, from the app's log: when, which egg, and the base of the hatch that followed
                       (kept on disk, since the log only keeps a couple of weeks)

Trainer avatars, relayed from Pokémon Showdown and cached on disk so pages can draw them into an image:
  /trainers.json        every trainer sprite name
  /trainer/<name>.png   one sprite

Pokémon and item sprites, relayed from PokeAPI's GitHub and kept on disk: /sprites/<path as on GitHub>
"""
import calendar
import errno
import glob
import json
import os
import plistlib
import re
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
import zlib
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from email.utils import formatdate
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, 'dist')
HOME = os.path.expanduser('~')
APP_DIR = os.path.join(HOME, 'Library/Application Support/PokeTokenBar')
SAVE = os.path.join(APP_DIR, 'companion-state.json')
USAGE = os.path.join(APP_DIR, 'usage-cache.json')
CURSOR_API = os.path.join(APP_DIR, 'cursor-usage-api-cache.json')
LOG = os.path.join(HOME, 'Library/Logs/PokeTokenBar.log')
OLD_LOG = os.path.join(HOME, 'Library/Logs/PokeTokenBar.old.log')
LOG_LINE = re.compile(r'\[(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)\] (?:egg purchased: discarded active, tier=(none|uncommon|rare)$|hatch: base=(\d+) )')
DOMAIN = 'io.github.chattymin.poketokenbar'
PREFS = os.path.join(HOME, 'Library/Preferences', DOMAIN + '.plist')
APPLE_EPOCH = 978307200
TOKEN_CAP = 10 ** 18
ISO_TIME = re.compile(r'(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(\.\d+)?(Z|[+-]\d\d:?\d\d)$')
CACHED = ('claude_code', 'codex', 'gemini', 'grok', 'pi', 'omp')
CODEX_VECTOR = ('input', 'cachedInput', 'cacheWriteInput', 'output', 'reasoningOutput', 'total')
PORT = 8649
URL = f'http://127.0.0.1:{PORT}'
# A site can point its own domain at 127.0.0.1 (DNS rebinding) and read these files as same-origin.
# Its requests still carry that domain in Host, so only the local names are served.
HOSTS = {f'127.0.0.1:{PORT}', f'localhost:{PORT}'}
LIVE = {'/save.json', '/usage.json', '/settings.json', '/egg-purchases.json'}
TRAINERS_URL = 'https://play.pokemonshowdown.com/sprites/trainers/'
TRAINERS_DIR = os.path.expanduser('~/Library/Caches/TokenDex/trainers')
TRAINER_NAME = re.compile(r'^[a-z0-9-]{1,48}$')
SPRITES_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/'
SPRITES_DIR = os.path.expanduser('~/Library/Caches/TokenDex/sprites')
SPRITE_PATH = re.compile(r'^(pokemon/(versions/generation-v/black-white/(animated/)?(shiny/)?)?[a-z0-9-]{1,32}\.(png|gif)|items/[a-z0-9-]{1,48}\.png)$')
EGG_PURCHASES = os.path.expanduser('~/Library/Caches/TokenDex/egg-purchases.json')
USER_AGENT = 'TokenDex (local)'

_usage = {}


def usage_body():
    """Tokens per local hour from every store PokeTokenBar v2.5.5 counts, and which providers that covers.
    A reader runs again only when one of its files changed."""
    hours, found, known, failed, mtime = {}, set(), set(), set(), 0
    for read, providers, paths in usage_sources():
        known.update(providers)
        sig = stamp(paths)
        mtime = max([mtime] + [m for _, m, _ in sig])
        if read.__name__ not in _usage or _usage[read.__name__][0] != sig:
            try:
                _usage[read.__name__] = sig, {p: by_hour(e.values()) for p, e in read(paths).items()} if paths else {}
            except (OSError, ValueError, KeyError, TypeError, AttributeError, OverflowError, sqlite3.Error):
                failed.update(providers)
        for provider, counts in _usage.get(read.__name__, ((), {}))[1].items():
            if counts:
                found.add(provider)
            for key, n in counts.items():
                hours[key] = hours.get(key, 0) + n
    sources = [{'id': p, 'counted': p in known and p not in failed} for p in sorted(found | active_today())]
    return json.dumps({'hours': dict(sorted(hours.items())), 'sources': sources}).encode(), mtime or time.time()


def active_today():
    """The providers whose tokens grew the Pokémon today, from the per-provider ledger the app keeps in its save."""
    try:
        with open(SAVE, 'rb') as f:
            state = json.load(f)
        if state.get('lastDate') == time.strftime('%Y-%m-%d'):
            return {p for p, n in state.get('claimedTodayTokensByProvider', {}).items() if n > 0}
    except (OSError, ValueError, AttributeError, TypeError):
        pass
    return set()


def usage_sources():
    """Each reader, the providers it counts and the files it reads, found where the app looks for them."""
    prefs = app_prefs()
    roots = lambda provider, defaults: scan_roots(defaults, prefs.get('customScanRoots.' + provider))
    home = lambda *paths: [os.path.join(HOME, p) for p in paths]
    antigravity = [os.path.join(r, n) for r in roots('antigravity', home(
        '.gemini/antigravity/conversations', '.gemini/antigravity-cli/conversations', '.gemini/antigravity-ide/conversations'))
        for n in sorted(listdir(r)) if n.endswith('.db')]
    opencode = []
    for r in roots('opencode', env_paths('OPENCODE_DATA_DIR', home('.local/share/opencode'))):
        opencode += [opencode_db(r)] + [f for f in walk(os.path.join(r, 'storage/message')) if f.endswith('.json')]
    kiro = []
    for r in roots('kiro', env_paths('KIRO_CLI_HOME', home('Library/Application Support/kiro-cli'))
                   + [os.path.join(p, 'sessions') for p in env_paths('KIRO_HOME', home('.kiro'))]):
        kiro += [r if r.endswith('.sqlite3') else os.path.join(r, 'data.sqlite3')] + [
            f for f in walk(r) if os.path.basename(f) == 'messages.jsonl' or (f.endswith('.jsonl') and os.path.basename(os.path.dirname(f)) == 'cli')]
    store = lambda provider, defaults, ext, name: [r if r.endswith(ext) else os.path.join(r, name) for r in roots(provider, defaults)]
    aside = sorted({os.path.realpath(os.path.join(d, 'state.db')) for r in roots('aside', home('.aside/u'))
                    for d in [r] + [os.path.join(r, n) for n in listdir(r)]})
    files = lambda paths: [p for p in dict.fromkeys(paths) if p and os.path.isfile(p)]
    return [
        (cache_usage, CACHED, files([USAGE])),
        (antigravity_usage, ('antigravity',), files(antigravity)),
        (opencode_usage, ('opencode',), files(opencode)),
        (hermes_usage, ('hermes',), files(store('hermes', env_paths('HERMES_HOME', home('.hermes')), '.db', 'state.db'))),
        (cursor_usage, ('cursor',), files([CURSOR_API] + store('cursor', env_paths('CURSOR_DATA_DIR', home(
            'Library/Application Support/Cursor/User/globalStorage', 'Library/Application Support/Cursor Nightly/User/globalStorage')),
            '.vscdb', 'state.vscdb'))),
        (copilot_usage, ('copilot',), files(store('copilot', env_paths('COPILOT_HOME', home('.copilot')), '.db', 'session-store.db'))),
        (kiro_usage, ('kiro',), files(kiro)),
        (aside_usage, ('aside',), files(aside)),
    ]


def app_prefs():
    try:
        with open(PREFS, 'rb') as f:
            return plistlib.load(f)
    except (OSError, ValueError):
        return {}


def env_paths(name, defaults):
    """The app's environmentPaths: a comma-separated override, else the defaults."""
    raw = os.environ.get(name, '').strip()
    return [p.strip() for p in raw.split(',') if p.strip()] if raw else defaults


def scan_roots(defaults, extra):
    """The app's CustomScanRoots.union: the extra folders set in Settings (globs allowed) after the defaults, never an ancestor of one."""
    defaults = fold(defaults)
    found = list(defaults)
    for part in re.split(r'[,\r\n]', extra if isinstance(extra, str) else ''):
        pattern = os.path.expanduser(part.strip())
        for path in sorted(glob.glob(pattern)) if pattern.startswith('/') else []:
            real = os.path.realpath(path).lower().rstrip('/') + '/'
            if os.path.isdir(path) and not any(d.lower() + '/' != real and d.lower().startswith(real) for d in defaults):
                found.append(path)
    return fold(found)


def fold(paths):
    """The app's normalizedRoots: symlinks resolved, duplicates and folders inside another dropped, case-insensitively."""
    real = list(dict.fromkeys(os.path.realpath(p) for p in paths))
    kept = []
    for path in sorted(real, key=len):
        if not any(path.lower() == k.lower() or path.lower().startswith(k.lower() + '/') for k in kept):
            kept.append(path)
    return [p for p in real if p in kept]


def listdir(path):
    try:
        return os.listdir(path)
    except OSError:
        return []


def walk(folder):
    for top, dirs, names in os.walk(folder):
        dirs[:] = sorted(d for d in dirs if not d.startswith('.'))
        yield from (os.path.join(top, n) for n in sorted(names) if not n.startswith('.'))


def stamp(paths):
    out = []
    for path in paths:
        for f in (path, path + '-wal'):
            try:
                st = os.stat(f)
            except OSError:
                continue
            out.append((f, st.st_mtime, st.st_size))
    return tuple(out)


def by_hour(entries):
    hours = {}
    for at, n in entries:
        key = time.strftime('%Y-%m-%dT%H', time.localtime(at))
        hours[key] = hours.get(key, 0) + n
    return hours


def keep_max(entries):
    """The app's dedupKeepMax: one entry per id, its largest total at its earliest time."""
    out = {}
    for key, at, n in filter(None, entries):
        out[key] = (min(at, out[key][0]), max(n, out[key][1])) if key in out else (at, n)
    return out


def made(key, at, input=0, output=0, cache_write=0, cache_read=0, total=0):
    """The app's makeEntry: the parts, or the reported total when larger; nothing when zero or undated."""
    n = max(input + output + cache_write + cache_read, total)
    return (key, at, n) if n > 0 and at is not None else None


def tokens(e):
    return e['input'] + e['output'] + e['cacheWrite'] + e['cacheRead']


def number(value):
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value.strip())
    except (AttributeError, ValueError):
        return None


def count(value):
    """A token count clamped the way the app's readers do: positive, finite, capped; an integer string counts too."""
    if isinstance(value, str):
        try:
            value = int(value.strip())
        except ValueError:
            return 0
    if not isinstance(value, (int, float)) or not 0 < value < float('inf'):
        return 0
    return min(TOKEN_CAP, int(value))


def epoch(value):
    """The app's dateValue: seconds, or milliseconds from 1e11 up."""
    n = number(value)
    return (n / 1000 if n >= 1e11 else n) if n is not None and 0 < n < float('inf') else None


def iso_time(text):
    m = ISO_TIME.match(text)
    if not m:
        return None
    y, mo, d, h, mi, s, frac, zone = m.groups()
    offset = 0 if zone == 'Z' else (-1 if zone[0] == '-' else 1) * (int(zone[1:3]) * 3600 + int(zone[-2:]) * 60)
    return calendar.timegm((int(y), int(mo), int(d), int(h), int(mi), int(s))) + float(frac or 0) - offset


def any_time(value):
    """The app's flexibleDateValue: an ISO 8601 string, else a number."""
    return iso_time(value) if isinstance(value, str) else epoch(value)


def text(value):
    return (value.strip() or None) if isinstance(value, str) else None


def column(value):
    return value.decode('utf-8', 'replace') if isinstance(value, bytes) else None if value is None else str(value)


def json_object(value):
    try:
        obj = json.loads(value)
    except (TypeError, ValueError):
        return None
    return obj if isinstance(obj, dict) else None


def json_file(path):
    try:
        with open(path, 'rb') as f:
            return json_object(f.read())
    except OSError:
        return None


def json_lines(path):
    try:
        with open(path, encoding='utf-8') as f:
            lines = f.read().split('\n')
    except (OSError, UnicodeDecodeError):
        return []
    return [o for o in map(json_object, lines) if o is not None]


def rows(path, sql):
    """The rows of `sql` in a tool's SQLite store, or None when it cannot be read through."""
    wal = path + '-wal'
    # Reading a WAL store's unmerged commits takes a read lock in its existing -shm index; an immutable open writes nothing but skips them.
    pending = os.path.exists(path + '-shm') and os.path.exists(wal) and os.path.getsize(wal) > 0
    for mode in ('mode=ro', 'immutable=1') if pending else ('immutable=1',):
        try:
            with closing(sqlite3.connect(f'file:{urllib.parse.quote(path)}?{mode}', uri=True)) as db:
                db.text_factory = lambda b: b.decode('utf-8', 'replace')
                return db.execute(sql).fetchall()
        except sqlite3.Error:
            pass
    return None


def cache_usage(paths):
    """Claude Code, Codex, Gemini, Grok, pi and omp, as the app parsed them into its cache, file by file."""
    with open(paths[0], 'rb') as f:
        raw = f.read()
    try:
        raw = zlib.decompress(raw, -15)
    except zlib.error:
        pass
    cache = json.loads(raw)

    def entries(name, counts=lambda path: True):
        return keep_max((e['id'], e['date'] + APPLE_EPOCH, tokens(e))
                        for path, blob in (cache.get(name) or {}).items() if counts(path) for e in blob.get('entries', []))
    return {'claude_code': entries('claude'), 'gemini': entries('gemini'), 'grok': entries('grok', grok_counts), 'pi': entries('pi'),
            'omp': entries('omp', lambda path: 'bridge' not in path.split('/')),
            'codex': codex_usage(blob['rollout'] for blob in (cache.get('codex') or {}).values())}


def grok_counts(path):
    """Grok folds a subagent session into its parent's turns; the app checks summary.json on every read, not in its cache."""
    if os.path.basename(path) != 'updates.jsonl':
        return False
    kind = (json_file(os.path.join(os.path.dirname(path), 'summary.json')) or {}).get('session_kind')
    return not (isinstance(kind, str) and kind.startswith('subagent'))


def codex_usage(rollouts):
    """The app's resolveCodexRollouts: a fork owns only the turns past the usage states it shares with its parent."""
    rollouts = sorted(rollouts, key=lambda r: r['path'])
    sessions, memo = {}, {}
    for r in rollouts:
        if r.get('sessionID') is not None:
            sessions.setdefault(r['sessionID'], []).append(r)

    def resolve(r, visiting):
        if r['path'] in memo:
            return memo[r['path']]
        if r['path'] in visiting:
            return codex_owned(r, codex_replayed(r))
        visiting.add(r['path'])
        best = None
        for parent in sessions.get(r.get('parentSessionID'), []):
            if parent['path'] != r['path']:
                history = resolve(parent, visiting)[0]
                n = codex_shared(r['events'], history)
                if n and (best is None or n > best[0]):
                    best = n, history[:n]
        if best:
            memo[r['path']] = codex_owned(r, *best)
        else:
            memo[r['path']] = codex_owned(r, 0 if r.get('parentSessionID') is None else codex_replayed(r))
        visiting.discard(r['path'])
        return memo[r['path']]

    out = {}
    for r in rollouts:
        for key, at, n in resolve(r, set())[1]:
            if key not in out or at < out[key][0]:
                out[key] = at, n
    return out


def codex_shared(events, history):
    if not events:
        return 0
    if not history:
        return None
    n = 0
    for event, state in zip(events, history):
        if event.get('usageState') is None or state is None:
            return None
        if event['usageState'] != state:
            break
        n += 1
    return n


def codex_replayed(r):
    """The app's fallback without the parent: a fork's first turns, written under a second apart, are its replay."""
    events = r['events']
    if r.get('isSubagent') or not events:
        return 0
    n = 1
    while n < len(events) and events[n]['entry']['date'] - events[n - 1]['entry']['date'] < 1:
        n += 1
    return n


def codex_owned(r, replay, inherited=()):
    history, entries, owner_before, epoch_, previous = list(inherited), [], None, 0, None
    for event in r['events'][replay:]:
        if r.get('parentSessionID') is not None or event.get('sessionID') is None:
            owner = r.get('sessionID')
        else:
            owner = event['sessionID']
        if owner != owner_before:
            owner_before, epoch_, previous = owner, 0, None
        state = event.get('usageState')
        prior, previous = previous, state['cumulative'] if state else None
        if previous and prior and any(previous[k] < prior[k] for k in CODEX_VECTOR):
            epoch_ += 1
        e = event['entry']
        key, n = e['id'], tokens(e)
        if owner is not None and state:
            last = state['last']
            if n == 0 and last['total'] > 0 and prior and previous['total'] > prior['total'] \
                    and max(0, last['input'] - last['cachedInput']) + last['cachedInput'] + last['output'] == 0:
                n = last['total']
            key = 'codex|%s|%d|%s' % (owner, epoch_, '|'.join(','.join(str(v[k]) for k in CODEX_VECTOR) for v in (previous, last)))
        entries.append((key, e['date'] + APPLE_EPOCH, n))
        history.append(state)
    return history, entries


def proto(data):
    """(field, varint, payload) of each protobuf field in turn, until the bytes stop making sense."""
    i = 0
    while i < len(data):
        key, i = proto_varint(data, i)
        if key is None or not key >> 3:
            return
        kind = key & 7
        if kind == 0:
            value, i = proto_varint(data, i)
            if value is None:
                return
            yield key >> 3, value, None
        elif kind == 2:
            size, i = proto_varint(data, i)
            if size is None or size > len(data) - i:
                return
            yield key >> 3, 0, data[i:i + size]
            i += size
        elif kind in (1, 5) and len(data) - i >= (8 if kind == 1 else 4):
            i += 8 if kind == 1 else 4
        else:
            return


def proto_varint(data, i):
    value = shift = 0
    while i < len(data) and shift <= 63:
        byte = data[i]
        i += 1
        value |= (byte & 0x7f) << shift
        if not byte & 0x80:
            return value & 0xFFFFFFFFFFFFFFFF, i
        shift += 7
    return None, i


def pb_message(data, field):
    return next((payload for f, _, payload in proto(data or b'') if f == field and payload is not None), None)


def pb_number(data, field):
    return next((value for f, value, payload in proto(data or b'') if f == field and payload is None), None)


def pb_text(data, field):
    try:
        return pb_message(data, field).decode() or None
    except (AttributeError, UnicodeDecodeError):
        return None


def pb_time(data, field):
    """A google.protobuf.Timestamp, None unless between 2001 and 2100."""
    stamp = pb_message(data, field)
    seconds = pb_number(stamp, 1)
    if stamp is None or seconds is None or not 1_000_000_000 <= seconds <= 4_102_444_800:
        return None
    nanos = pb_number(stamp, 2) or 0
    return seconds + (nanos / 1e9 if nanos < 1e9 else 0)


def antigravity_usage(paths):
    """Antigravity: one SQLite store per conversation, each call's tokens in a protobuf blob (field numbers from the app's reader)."""
    entries = []
    for path in paths:
        tables = {name for name, in rows(path, "SELECT name FROM sqlite_master WHERE type = 'table'") or []}
        steps = rows(path, 'SELECT metadata FROM steps WHERE metadata IS NOT NULL ORDER BY idx') if 'steps' in tables else []
        records = rows(path, 'SELECT idx, data FROM gen_metadata WHERE data IS NOT NULL ORDER BY idx') if 'gen_metadata' in tables else None
        if steps is None or records is None:
            continue
        by_response, by_execution, taken = {}, {}, {}
        for meta, in steps:
            meta = meta.encode() if isinstance(meta, str) else bytes(meta)
            at = pb_time(meta, 8) or pb_time(meta, 1)
            if at is None:
                continue
            response, execution = pb_text(pb_message(meta, 9), 11), pb_text(meta, 12)
            if response:
                by_response[response] = at
            if execution:
                by_execution.setdefault(execution, []).append(at)
        store_time = max(os.path.getmtime(f) for f in (path, path + '-wal') if os.path.exists(f))
        for index, data in records:
            data = data.encode() if isinstance(data, str) else bytes(data)
            chat = pb_message(data, 1)
            usage = pb_message(chat, 4)
            if not data or usage is None:
                continue
            response, execution = pb_text(usage, 11), pb_text(data, 4)
            start = pb_message(chat, 9)
            if pb_message(start, 4) is not None:
                at = pb_time(start, 4)
                if at is None:
                    continue
            elif response in by_response:
                at = by_response[response]
            elif execution in by_execution:
                taken[execution] = taken.get(execution, -1) + 1
                at = by_execution[execution][min(taken[execution], len(by_execution[execution]) - 1)]
            else:
                at = store_time
            n = sum(c for c in (pb_number(usage, f) for f in (2, 3, 4, 5)) if c is not None and c <= 1_000_000_000)
            key = 'antigravity|' + response if response else f'antigravity|{os.path.basename(path)[:-3]}|{index}'
            entries.append(made(key, at, n))
    return {'antigravity': keep_max(entries)}


def opencode_db(root):
    if root.endswith('.db') or os.path.exists(os.path.join(root, 'opencode.db')):
        return root if root.endswith('.db') else os.path.join(root, 'opencode.db')
    channels = sorted(n for n in listdir(root) if re.fullmatch(r'opencode-[A-Za-z0-9_-]+\.db', n))
    return os.path.join(root, channels[0]) if channels else None


def opencode_usage(paths):
    """OpenCode: assistant messages in its V2 session_message and V1 message tables, and in legacy message files."""
    entries = []
    for path in paths:
        if path.endswith('.db'):
            for key, created, data in rows(path, "SELECT id, time_created, data FROM session_message WHERE type = 'assistant'") or []:
                entries.append(opencode_v2(json_object(data) or {}, column(key), created))
            for key, data in rows(path, 'SELECT id, data FROM message') or []:
                entries.append(opencode_v1(json_object(data) or {}, column(key)))
        else:
            entries.append(opencode_v1(json_file(path) or {}, os.path.basename(path)[:-5]))
    return {'opencode': keep_max(entries)}


def opencode_v1(obj, fallback):
    usage, created = obj.get('tokens'), obj.get('time')
    if not isinstance(usage, dict) or not isinstance(created, dict) or not text(obj.get('modelID')) or not text(obj.get('providerID')):
        return None
    cache = usage.get('cache') if isinstance(usage.get('cache'), dict) else {}
    return made(f"opencode|{text(obj.get('id')) or fallback}", epoch(created.get('created')), count(usage.get('input')),
                count(usage.get('output')), count(cache.get('write')), count(cache.get('read')), count(usage.get('total')))


def opencode_v2(obj, fallback, created):
    usage, model = obj.get('tokens'), obj.get('model')
    if not isinstance(usage, dict) or not isinstance(model, dict) or not text(model.get('id')) or not text(model.get('providerID')):
        return None
    cache = usage.get('cache') if isinstance(usage.get('cache'), dict) else {}
    return made(f'opencode|{fallback}', epoch(created), count(usage.get('input')), count(usage.get('output')) + count(usage.get('reasoning')),
                count(cache.get('write')), count(cache.get('read')))


def hermes_usage(paths):
    """Hermes Agent: one row per session in its state.db, all of it counted at the session's start, first copy kept."""
    out = {}
    for path in paths:
        for key, model, at, input, output, reasoning, write, read in rows(path, (
                'SELECT id, model, started_at, input_tokens, output_tokens, reasoning_tokens, cache_write_tokens, cache_read_tokens'
                " FROM sessions WHERE model IS NOT NULL AND TRIM(model) != ''")) or []:
            e = made(f'hermes|{text(column(key))}', epoch(at), count(input), count(output) + count(reasoning), count(write), count(read))
            if e and text(column(key)) and text(column(model)) and e[0] not in out:
                out[e[0]] = e[1:]
    return {'hermes': out}


def cursor_usage(paths):
    """Cursor: the dashboard events the app last fetched and kept on disk, then outside their window the IDE's chat bubbles,
    which is what the app counts when the dashboard does not answer."""
    entries, window = [], None
    for path in paths:
        if path == CURSOR_API:
            with open(path, 'rb') as f:
                api = json.load(f)
            entries += [(e['id'], e['date'] + APPLE_EPOCH, tokens(e)) for e in api.get('entries', [])]
            window = api.get('coveredSince', float('-inf')) + APPLE_EPOCH, api['fetchedAt'] + APPLE_EPOCH
            continue
        for key, value in rows(path, "SELECT key, value FROM cursorDiskKV WHERE key GLOB 'bubbleId:*'") or []:
            bubble = json_object(value) or {}
            usage = bubble.get('tokenCount') if isinstance(bubble.get('tokenCount'), dict) else {}
            e = made('cursor|' + column(key), any_time(bubble.get('createdAt')), count(usage.get('inputTokens')), count(usage.get('outputTokens')))
            if e and not (window and window[0] <= e[1] <= window[1]):
                entries.append(e)
    return {'cursor': keep_max(entries)}


def copilot_usage(paths):
    """GitHub Copilot CLI: one row per billed call, its prompt including the cached tokens counted apart."""
    entries = []
    for path in paths:
        for key, prompt, output, read, write, created in rows(path, (
                'SELECT id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, created_at FROM assistant_usage_events')) or []:
            read, write = count(read), count(write)
            entries.append(made(f'copilot|{path}|{key}', copilot_time(column(created)), max(0, count(prompt) - read - write), count(output), write, read))
    return {'copilot': keep_max(entries)}


def copilot_time(raw):
    """Copilot writes ISO 8601 with a Z, or SQLite's datetime('now'): UTC with a space and no zone."""
    raw = (raw or '').strip().replace(' ', 'T', 1)
    if len(raw) < 19:
        return None
    return iso_time(raw if any(c in raw[11:] for c in 'Z+-') else raw + 'Z')


def kiro_usage(paths):
    """Kiro keeps no token counts: the app estimates 4 bytes a token, a turn's prompt being all the history it resends."""
    entries = []
    for path in paths:
        if path.endswith('.sqlite3'):
            for key, value in rows(path, 'SELECT conversation_id, value FROM conversations_v2') or []:
                obj = json_object(value)
                if obj is not None:
                    entries += kiro_turns(column(key) if key is not None else text(obj.get('conversation_id')) or path, obj)
            for value, in rows(path, 'SELECT value FROM conversations') or []:
                obj = json_object(value) or {}
                if text(obj.get('conversation_id')):
                    entries += kiro_turns(text(obj['conversation_id']), obj)
        elif os.path.basename(path) == 'messages.jsonl':
            entries += kiro_v3(path)
        else:
            entries += kiro_cli(path)
    return {'kiro': keep_max(entries)}


def kiro_turns(conversation, obj):
    out, history = [], kiro_size(obj.get('latest_summary', 0))
    for turn in obj.get('history') if isinstance(obj.get('history'), list) else []:
        if not isinstance(turn, dict):
            continue
        user, meta = kiro_field(turn.get('user')), turn.get('request_metadata')
        stamp = number(meta.get('request_start_timestamp_ms')) if isinstance(meta, dict) else None
        if stamp is not None and 0 < stamp < float('inf'):
            out.append(made(f'kiro|{conversation}|{int(stamp)}', epoch(stamp), (history + user) // 4, count(meta.get('response_size')) // 4))
        history += user + kiro_field(turn.get('assistant'))
    return out


def kiro_size(value):
    """Bytes of a JSON value as the app counts them: UTF-8 strings, numbers as NSNumber prints them, containers summed."""
    if isinstance(value, str):
        return len(value.encode())
    if isinstance(value, (int, float)):
        return len(str(int(value)) if isinstance(value, (bool, int)) else '%.16g' % value)
    if isinstance(value, (list, dict)):
        return sum(map(kiro_size, value.values() if isinstance(value, dict) else value))
    return 0


def kiro_field(value):
    if isinstance(value, dict):
        return sum(kiro_size(v) for k, v in value.items() if k != 'images')
    return len(value.encode()) if isinstance(value, str) else 0


def kiro_text(value):
    if isinstance(value, str):
        return len(value.encode())
    if isinstance(value, list):
        return sum(map(kiro_text, value))
    if not isinstance(value, dict):
        return 0
    if isinstance(value.get('kind'), str):
        return kiro_text(value.get('data')) if value['kind'] == 'text' else 0
    return next((kiro_text(value[k]) for k in ('content', 'text', 'data') if k in value), 0)


def kiro_cli(path):
    """Kiro CLI 2.20 sessions: Prompt, AssistantMessage, ToolResults and Clear events, a turn per prompt."""
    session = text((json_file(path[:-len('.jsonl')] + '.json') or {}).get('session_id')) or os.path.basename(path)[:-len('.jsonl')]
    out, history, prompt, raw, at, answer, tools, started = [], 0, 0, None, None, 0, 0, False

    def flush():
        nonlocal history, prompt, raw, at, answer, tools
        if started and at is not None:
            stamp = number(raw)
            millis = int(stamp * 1000 if stamp < 1e12 else stamp) if stamp is not None and 0 < stamp < float('inf') else int(at * 1000)
            out.append(made(f'kiro|cli|{session}|{millis}', at, (history + prompt + tools) // 4, answer // 4))
        history, prompt, raw, at, answer, tools = history + prompt + answer + tools, 0, None, None, 0, 0

    for line in json_lines(path):
        kind, data = text(line.get('kind')), line.get('data') if isinstance(line.get('data'), dict) else {}
        if kind == 'Prompt':
            if started:
                flush()
            started, prompt, answer, tools = True, kiro_text(data.get('content')), 0, 0
            raw = data['meta'].get('timestamp') if isinstance(data.get('meta'), dict) else None
            at = any_time(raw)
        elif kind == 'AssistantMessage':
            answer += kiro_text(data.get('content'))
        elif kind == 'ToolResults':
            tools += kiro_text(data.get('content'))
        elif kind == 'Clear':
            flush()
            started, history = False, 0
    flush()
    return out


def kiro_v3(path):
    """Kiro v3 and IDE sessions: messages.jsonl beside session.json, in structured {payload} or flat {role} events."""
    session = json_file(os.path.join(os.path.dirname(path), 'session.json')) or {}
    name = text(session.get('id')) or os.path.basename(os.path.dirname(path))
    fallback = any_time(session.get('createdAt'))
    fallback = any_time(session.get('lastModifiedAt')) if fallback is None else fallback
    out, history, prompt, at, answer, started, index = [], 0, 0, None, 0, False, 0

    def flush():
        nonlocal history, prompt, at, answer, index
        content = started and prompt + answer > 0
        if content:
            out.append(made(f'kiro|v3|{name}|{index}', fallback if at is None else at, (history + prompt) // 4, answer // 4))
            index += 1
        history, prompt, at, answer = history + prompt + answer, 0, None, 0

    for line in json_lines(path):
        payload = line.get('payload') if isinstance(line.get('payload'), dict) else {}
        kind, role, when = text(payload.get('type')), text(line.get('role')), any_time(line.get('timestamp'))
        if kind in ('user', None) and (kind or role in ('user', 'human', 'prompt')):
            if started:
                flush()
            started, prompt, at, answer = True, kiro_text((payload if kind else line).get('content')), when, 0
        elif kind in ('assistant', 'tool_call') or (kind is None and role in ('assistant', 'bot')):
            if kind == 'tool_call':
                answer += (len(payload['args'].encode()) if isinstance(payload['args'], str) else kiro_size(payload['args'])) if 'args' in payload else 0
            else:
                answer += kiro_text((payload if kind else line).get('content'))
                at = when if at is None else at
            started = started or answer > 0
        elif kind == 'tool_result':
            prompt += kiro_text(payload.get('content'))
        elif kind == 'turn_end':
            at = when if at is None else at
            flush()
            started = False
    flush()
    return out


def aside_usage(paths):
    """Aside: each turn's running token totals in a state.db per user, counted at the turn's last activity."""
    entries = []
    for path in paths:
        store = f'aside|{path}#{os.stat(path).st_ino}'
        for key, usage, at in rows(path, (
                'SELECT t.id, t.token_usage, COALESCE(t.finished_at, t.last_message_timestamp) FROM session_turns t'
                ' LEFT JOIN sessions s ON s.id = t.session_id WHERE COALESCE(t.finished_at, t.last_message_timestamp) >= 0')) or []:
            usage = json_object(usage) or {}
            buckets = any(isinstance(usage.get(k), (int, float)) for k in ('input', 'output', 'cacheRead', 'cacheWrite'))
            parts = (usage.get('input') if buckets else usage.get('totalTokens'), usage.get('output'), usage.get('cacheWrite'), usage.get('cacheRead'))
            entries.append(made(f'{store}:{key}', number(at), *(0 if isinstance(v, str) else count(v) for v in parts)))
    return {'aside': keep_max(entries)}


def settings_body():
    def read(key):
        out = subprocess.run(['defaults', 'read', DOMAIN, key], capture_output=True, text=True).stdout.strip()
        try:
            return round(float(out) * 100)
        except ValueError:
            return 100
    return json.dumps({'growth': read('growthDifficulty'), 'shop': read('shopDifficulty')}).encode(), time.time()


def logged_purchases():
    """Each egg purchase in the app's log, oldest first, with the base of the next hatch once the log has it."""
    found, waiting = [], []
    for path in (OLD_LOG, LOG):
        try:
            with open(path, errors='replace') as f:
                lines = f.readlines()
        except OSError:
            continue
        for line in lines:
            m = LOG_LINE.match(line.rstrip('\n'))
            if m and m[2]:
                waiting.append({'at': m[1], 'tier': m[2], 'base': None})
                found.append(waiting[-1])
            elif m:
                for p in waiting:
                    p['base'] = int(m[3])
                waiting = []
    return found


def egg_purchases_body():
    """Every egg purchase seen in the app's log since the first run."""
    try:
        with open(EGG_PURCHASES) as f:
            kept = {p['at']: p for p in json.load(f)}
    except (OSError, ValueError):
        kept = {}
    purchases = {**kept, **{p['at']: p for p in logged_purchases()}}
    body = json.dumps(sorted(purchases.values(), key=lambda p: p['at'])).encode()
    if purchases != kept:
        write_file(EGG_PURCHASES, body)
    return body, time.time()


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=15) as r:
        return r.read()


def cached(path, build, max_age=None):
    """Returns the cached file, fetching it with `build` when missing or older than `max_age` seconds."""
    try:
        if max_age is None or time.time() - os.stat(path).st_mtime < max_age:
            with open(path, 'rb') as f:
                return f.read(), os.fstat(f.fileno()).st_mtime
    except OSError:
        pass
    body = build()
    write_file(path, body)
    return body, time.time()


def write_file(path, body):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f'{path}.{threading.get_ident()}.tmp'
    with open(tmp, 'wb') as f:
        f.write(body)
    os.replace(tmp, path)


def trainers_body():
    listing = lambda: json.dumps({'trainers': sorted(set(re.findall(r'href="([a-z0-9-]+)\.png"', fetch(TRAINERS_URL).decode())))}).encode()
    return cached(os.path.join(TRAINERS_DIR, 'list.json'), listing, max_age=7 * 86400)


def trainer_body(name):
    if not TRAINER_NAME.match(name):
        raise ValueError(name)
    return cached(os.path.join(TRAINERS_DIR, name + '.png'), lambda: fetch(TRAINERS_URL + name + '.png'))


def sprite_body(path):
    if not SPRITE_PATH.match(path):
        raise ValueError(path)
    return cached(os.path.join(SPRITES_DIR, path), lambda: fetch(SPRITES_URL + path))


def prefetch_sprites():
    """Fetches the 649 Pokédex sprites missing from the cache, so a first visit does not wait on them one by one."""
    def one(n):
        try:
            sprite_body(f'pokemon/versions/generation-v/black-white/{n}.png')
        except OSError:
            pass
    with ThreadPoolExecutor(8) as pool:
        pool.map(one, range(1, 650))


def save_body():
    with open(SAVE, 'rb') as f:
        return f.read(), os.fstat(f.fileno()).st_mtime


class Handler(SimpleHTTPRequestHandler):
    def parse_request(self):
        if not super().parse_request():
            return False
        if self.headers.get('Host', '').lower() not in HOSTS:
            self.send_error(403, 'Unknown host')
            return False
        return True

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/trainers.json' or path.startswith('/trainer/'):
            return self.send_trainer(path)
        if path.startswith('/sprites/'):
            return self.send_sprite(path[len('/sprites/'):])
        if path not in LIVE:
            return super().do_GET()
        try:
            body, mtime = {'/save.json': save_body, '/usage.json': usage_body, '/settings.json': settings_body,
                           '/egg-purchases.json': egg_purchases_body}[path]()
        except (OSError, ValueError, KeyError):
            return self.send_error(404, f'{path} unavailable')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Last-Modified', formatdate(mtime, usegmt=True))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def send_trainer(self, path):
        try:
            if path == '/trainers.json':
                body, kind = trainers_body()[0], 'application/json'
            elif path.endswith('.png'):
                body, kind = trainer_body(path[len('/trainer/'):-len('.png')])[0], 'image/png'
            else:
                raise ValueError(path)
        except ValueError:
            return self.send_error(404)
        except OSError:
            return self.send_error(502, 'Showdown unreachable')
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'max-age=604800')
        self.end_headers()
        self.wfile.write(body)

    def send_response(self, code, message=None):
        self.code = code
        super().send_response(code, message)

    def send_sprite(self, path):
        try:
            body = sprite_body(path)[0]
        except (ValueError, urllib.error.HTTPError):
            return self.send_error(404)
        except OSError:
            return self.send_error(502, 'GitHub unreachable')
        self.send_response(200)
        self.send_header('Content-Type', 'image/gif' if path.endswith('.gif') else 'image/png')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'max-age=2592000')
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        path = self.path.split('?')[0]
        # Vite names every built asset after its content: a changed file gets a new name, so they never need checking.
        if path.startswith('/assets/') and self.code == 200:
            self.send_header('Cache-Control', 'max-age=31536000, immutable')
        elif path not in LIVE and not path.startswith(('/trainer', '/sprites/')):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *args):
        pass


class Server(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        # The browser drops a download when the page it was for goes away: nothing to report.
        if not isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            super().handle_error(request, client_address)


def main(argv):
    if not os.path.isfile(os.path.join(DIST, 'index.html')):
        sys.exit('dist/ is missing: run `npm install && npm run build` first.')
    try:
        server = Server(('127.0.0.1', PORT), partial(Handler, directory=DIST))
    except OSError as e:
        if e.errno != errno.EADDRINUSE:
            raise
        if '--open' in argv:
            webbrowser.open(URL)
        sys.exit(f'Port {PORT} is already in use, most likely by TokenDex: {URL}')
    print(f'TokenDex on {URL}', flush=True)
    if '--open' in argv:
        webbrowser.open(URL)
    threading.Thread(target=prefetch_sprites, daemon=True).start()
    try:
        egg_purchases_body()
    except OSError:
        pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main(sys.argv[1:])
