// The save shared by every TokenDex page. It is loaded on the home page (index.html) and kept in this browser only.
const SAVE_KEY = 'poketokenbar-save-v2';
function readStoredSave() {
  try { const v = JSON.parse(localStorage.getItem(SAVE_KEY)); return v && v.st ? v : null; } catch (e) { return null; }
}
function storeSave(v) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch (e) {} }
function forgetSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
const fmtSaveDate = ms => new Date(ms).toLocaleString(LOCALE, {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
// Re-render when the home page, open in another tab, loads or forgets a save.
function watchSave(onChange) {
  addEventListener('storage', e => { if (e.key === SAVE_KEY || e.key === null) onChange(readStoredSave()); });
}

/* Unown (#201) keeps its letter since the app's Unown forms (#288). PokeAPI names the sprites 201-b … 201-z,
   201-exclamation, 201-question; A stays 201, like saves from before the letters. The result also works as a
   collection key: two Unown with different letters are different catches. */
const spriteID = (id, form) => id === 201 && form && form !== 'a' ? `201-${form}` : id;
const unownSymbol = form => form === 'exclamation' ? '!' : form === 'question' ? '?' : (form || 'a').toUpperCase();
const withForm = (name, id, form) => id === 201 ? `${name} [${unownSymbol(form)}]` : name;

// Header medallion: the Pokémon growing right now, or the egg between two hatches.
function setMascot(v) {
  const m = document.getElementById('mascot'), a = v && v.st.active;
  if (!m) return;
  m.className = a ? 'mascot' : 'mascot egg';
  m.firstChild.src = a
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${a.isShiny ? 'shiny/' : ''}${spriteID((a.path || [])[a.stage] || a.baseID, a.unownForm)}.gif`
    : 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/egg.png';
}

/* Growth rules of the app (PokemonBalance), shared by En cours and Boutique. g is the growth slider in percent. */
const GRAD = {common: 750e6, uncommon: 1875e6, rare: 3e9, legendary: 6e9};
const CANDY_XP = 100e6;
const scaled = (x, pct) => Math.round(x * Math.min(2, Math.max(0.1, pct / 100)));
function stageCosts(a, g) {
  const k = Math.max(1, a.forms), den = k * (k + 1) / 2, mult = a.boost ? 2 : 1;
  return Array.from({length: k}, (_, i) => scaled(Math.max(1, Math.round(Math.round(GRAD[a.rarity] * (i + 1) / den) / mult)), g));
}
const toGraduation = (a, g) => { const c = stageCosts(a, g); return c[a.stage] - a.used + c.slice(a.stage + 1).reduce((x, y) => x + y, 0); };
// Below 10 M the rounding to a whole million hid real amounts: an egg at 10 % growth costs 500 k, not "1 M".
const tok = n => n >= 1e9 ? (n / 1e9).toLocaleString(LOCALE, {minimumFractionDigits: 2, maximumFractionDigits: 2}) + tr(' Md', ' B')
  : n >= 1e6 || n === 0 ? (n / 1e6).toLocaleString(LOCALE, {maximumFractionDigits: n >= 1e7 ? 0 : 1}) + ' M'
  : n < 1e3 ? '< 1 k' : Math.round(n / 1e3).toLocaleString(LOCALE) + ' k';

/* Hourly usage from serve.py's usage.json, keyed by local hour. */
const hourKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}`;
// Average tokens for each hour of the day over the last 14 full days.
function hourProfile(hours, now) {
  const prof = new Array(24).fill(0), d = new Date(now); d.setHours(0, 0, 0, 0);
  for (let day = 1; day <= 14; day++) {
    const base = new Date(d); base.setDate(d.getDate() - day);
    for (let h = 0; h < 24; h++) { base.setHours(h); prof[h] += (hours[hourKey(base)] || 0) / 14; }
  }
  return prof;
}

const appleDate = t => typeof t === 'number' ? Math.round((t + 978307200) * 1000) : typeof t === 'string' ? Date.parse(t) || null : null;
function compactState(st) {
  const fr = (names, id) => names && names[id] ? (names[id].fr || names[id].en || null) : null;
  return {
    collectedFinals: st.collectedFinals || [],
    dex: st.dex.map(d => ({id: d.id, baseID: d.baseID, finalID: d.finalID, rarity: d.rarity, isShiny: !!d.isShiny,
      releasedAt: d.releasedAt ? 1 : 0, finalName: d.finalName || fr(d.names, d.finalID),
      chain: d.chainOrder || [d.baseID], names: Object.fromEntries((d.chainOrder || []).map(id => [id, fr(d.names, id)])),
      caughtAt: appleDate(d.caughtAt), unownForm: d.unownForm || null})),
    active: st.active ? {baseID: st.active.baseID, rarity: st.active.rarity, isShiny: !!st.active.isShiny,
      path: st.active.pathIDs || [], stage: st.active.stageIndex || 0, planned: st.active.plannedPathIDs || st.active.pathIDs || [],
      forms: st.active.totalForms || 1, used: st.active.usedAtStage || 0, boost: !!st.active.hasGrowthBoost,
      unownForm: st.active.unownForm || null} : null,
    eggUsage: st.eggUsage || 0,
    pendingHatchID: st.pendingHatchID ?? null, eggTier: st.eggTier ?? null,
    inventory: st.inventory || {}, usedSinceInstall: st.usedSinceInstall || 0, spentTokens: st.spentTokens || 0
  };
}
async function readSaveFile(f) {
  const raw = JSON.parse(await f.text());
  const exported = raw.format === 'poketokenbar.save';
  const st = exported ? raw.state : raw;
  if (!st || !Array.isArray(st.dex) || !Array.isArray(st.collectedFinals)) throw new Error('not a PokeTokenBar save');
  const v = {at: exported ? Date.parse(raw.exportedAt) || f.lastModified : f.lastModified, st: compactState(st)};
  storeSave(v);
  return v;
}

/* Served by serve.py: save.json is the app's live companion-state.json, read again on every page load. */
const served = location.protocol.startsWith('http');
async function fetchServedSave() {
  if (!served) return null;
  try {
    const r = await fetch('save.json', {cache: 'no-store'});
    if (!r.ok) return null;
    return await readSaveFile({text: () => r.text(), lastModified: Date.parse(r.headers.get('Last-Modified')) || Date.now()});
  } catch (e) { return null; }
}
async function fetchServedJSON(path) {
  if (!served) return null;
  try { const r = await fetch(path, {cache: 'no-store'}); return r.ok ? await r.json() : null; } catch (e) { return null; }
}
// The app's growth and shop sliders in percent: live from serve.py, else the last values typed on Prochains.
const SETTINGS_KEY = 'poketokenbar-settings-v1';
async function appSettings() {
  const live = await fetchServedJSON('settings.json');
  if (live) {
    const v = {g: live.growth, s: live.shop};
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(v)); } catch (e) {}
    return {...v, live: true};
  }
  try { const v = JSON.parse(localStorage.getItem(SETTINGS_KEY)); if (v && v.g && v.s) return v; } catch (e) {}
  return {g: 100, s: 100};
}
// Reads the served save at load and when the tab comes back, and re-renders only if the app wrote since.
function wireServedSave(onLoad) {
  const refresh = async () => {
    const before = readStoredSave(), v = await fetchServedSave();
    document.body.classList.toggle('live', !!v);
    if (v && (!before || before.at !== v.at)) onLoad(v);
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh();
}
