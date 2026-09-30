#!/usr/bin/env python3
"""Serves TokenDex on http://127.0.0.1:8649: the pages built in dist/ by `npm run build`.

Live data, read from the app on every request:
  /save.json      the app's companion-state.json
  /usage.json     tokens per local hour, from the app's usage cache (counts only, no prompts or model names)
  /settings.json  the growth and shop sliders of the app

Trainer avatars, relayed from Pokémon Showdown and cached on disk so pages can draw them into an image:
  /trainers.json        every trainer sprite name
  /trainer/<name>.png   one sprite
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import zlib
from email.utils import formatdate
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, 'dist')
APP_DIR = os.path.expanduser('~/Library/Application Support/PokeTokenBar')
SAVE = os.path.join(APP_DIR, 'companion-state.json')
USAGE = os.path.join(APP_DIR, 'usage-cache.json')
DOMAIN = 'io.github.chattymin.poketokenbar'
APPLE_EPOCH = 978307200
PORT = 8649
# A site can point its own domain at 127.0.0.1 (DNS rebinding) and read these files as same-origin.
# Its requests still carry that domain in Host, so only the local names are served.
HOSTS = {f'127.0.0.1:{PORT}', f'localhost:{PORT}'}
LIVE = {'/save.json', '/usage.json', '/settings.json'}
TRAINERS_URL = 'https://play.pokemonshowdown.com/sprites/trainers/'
TRAINERS_DIR = os.path.expanduser('~/Library/Caches/TokenDex/trainers')
TRAINER_NAME = re.compile(r'^[a-z0-9-]{1,48}$')
USER_AGENT = 'TokenDex (local)'

_usage = {'mtime': None, 'body': None}


def usage_body():
    """Hourly token totals, deduplicated by entry id like the app does. Rebuilt only when the cache changes."""
    mtime = os.stat(USAGE).st_mtime
    if _usage['mtime'] != mtime:
        with open(USAGE, 'rb') as f:
            raw = f.read()
        try:
            raw = zlib.decompress(raw, -15)
        except zlib.error:
            pass
        cache, seen, hours = json.loads(raw), set(), {}
        for provider in ('claude', 'gemini', 'grok', 'pi', 'omp'):
            for blob in (cache.get(provider) or {}).values():
                for e in blob.get('entries', []):
                    if e['id'] in seen:
                        continue
                    seen.add(e['id'])
                    hour = time.strftime('%Y-%m-%dT%H', time.localtime(e['date'] + APPLE_EPOCH))
                    hours[hour] = hours.get(hour, 0) + e['input'] + e['output'] + e['cacheWrite'] + e['cacheRead']
        _usage['mtime'], _usage['body'] = mtime, json.dumps({'hours': dict(sorted(hours.items()))}).encode()
    return _usage['body'], mtime


def settings_body():
    def read(key):
        out = subprocess.run(['defaults', 'read', DOMAIN, key], capture_output=True, text=True).stdout.strip()
        try:
            return round(float(out) * 100)
        except ValueError:
            return 100
    return json.dumps({'growth': read('growthDifficulty'), 'shop': read('shopDifficulty')}).encode(), time.time()


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=15) as r:
        return r.read()


def cached(name, build, max_age=None):
    """Returns the cached file, fetching it with `build` when missing or older than `max_age` seconds."""
    path = os.path.join(TRAINERS_DIR, name)
    try:
        if max_age is None or time.time() - os.stat(path).st_mtime < max_age:
            with open(path, 'rb') as f:
                return f.read(), os.fstat(f.fileno()).st_mtime
    except OSError:
        pass
    body = build()
    os.makedirs(TRAINERS_DIR, exist_ok=True)
    with open(path + '.tmp', 'wb') as f:
        f.write(body)
    os.replace(path + '.tmp', path)
    return body, time.time()


def trainers_body():
    listing = lambda: json.dumps({'trainers': sorted(set(re.findall(r'href="([a-z0-9-]+)\.png"', fetch(TRAINERS_URL).decode())))}).encode()
    return cached('list.json', listing, max_age=7 * 86400)


def trainer_body(name):
    if not TRAINER_NAME.match(name):
        raise ValueError(name)
    return cached(name + '.png', lambda: fetch(TRAINERS_URL + name + '.png'))


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
        if path not in LIVE:
            return super().do_GET()
        try:
            body, mtime = {'/save.json': save_body, '/usage.json': usage_body, '/settings.json': settings_body}[path]()
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

    def end_headers(self):
        if self.path.split('?')[0] not in LIVE and not self.path.startswith('/trainer'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    if not os.path.isfile(os.path.join(DIST, 'index.html')):
        sys.exit('dist/ is missing: run `npm install && npm run build` first.')
    try:
        ThreadingHTTPServer(('127.0.0.1', PORT), partial(Handler, directory=DIST)).serve_forever()
    except KeyboardInterrupt:
        pass
