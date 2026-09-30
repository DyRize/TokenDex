import {resolve} from 'node:path';
import {defineConfig} from 'vite';
import preact from '@preact/preset-vite';

// One HTML entry per page, kept at the root so the URLs stay the same as before the migration.
const PAGES = ['index', 'encours', 'journal', 'carte', 'boutique', 'prochains-pokemon', 'chance-tirage', 'chrono-pokedex'];
// In dev, the live data still comes from serve.py.
const LIVE = ['/save.json', '/usage.json', '/settings.json', '/trainers.json', '/trainer'];

export default defineConfig({
  plugins: [preact()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: Object.fromEntries(LIVE.map(p => [p, {target: 'http://127.0.0.1:8649', changeOrigin: true}])),
  },
  build: {
    rolldownOptions: {input: Object.fromEntries(PAGES.map(p => [p, resolve(import.meta.dirname, `${p}.html`)]))},
  },
});
