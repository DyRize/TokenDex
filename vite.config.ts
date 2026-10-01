import {resolve} from 'node:path';
import {defineConfig} from 'vite';
import preact from '@preact/preset-vite';

// One HTML entry per page, kept at the root so the URLs stay the same as before the migration.
const PAGES = ['index', 'encours', 'journal', 'carte', 'boutique', 'prochains-pokemon', 'chance-tirage', 'chrono-pokedex'];
// In dev, the live data still comes from serve.py.
const LIVE = ['/save.json', '/usage.json', '/settings.json', '/trainers.json', '/trainer', '/sprites'];

// The page script blocks the first paint: the browser keeps showing the previous page until Preact has drawn
// this one, so moving between pages never shows a blank or half-drawn frame.
const renderBlocking = {
  name: 'render-blocking-entry',
  transformIndexHtml: {order: 'post' as const, handler: (html: string) => html.replace('<script type="module" crossorigin', '<script type="module" blocking="render" crossorigin')},
};

export default defineConfig({
  plugins: [preact(), renderBlocking],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: Object.fromEntries(LIVE.map(p => [p, {target: 'http://127.0.0.1:8649', changeOrigin: true}])),
  },
  build: {
    rolldownOptions: {input: Object.fromEntries(PAGES.map(p => [p, resolve(import.meta.dirname, `${p}.html`)]))},
  },
});
