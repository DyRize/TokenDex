// The save shared by every page: served live by serve.py, or loaded from an export on the home page, and kept in this browser.
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

/* companion-state.json as the app writes it, only the fields read here. Dates are Apple reference seconds. */
interface AppDexEntry {
  id?: string; baseID: number; finalID: number; rarity: Rarity; isShiny?: boolean; releasedAt?: unknown;
  chainOrder?: number[]; caughtAt?: number | string; unownForm?: string;
}
interface AppActive {
  baseID: number; rarity: Rarity; isShiny?: boolean; pathIDs?: number[]; stageIndex?: number; plannedPathIDs?: number[];
  totalForms?: number; usedAtStage?: number; hasGrowthBoost?: boolean; unownForm?: string;
}
interface AppState {
  dex: AppDexEntry[]; collectedFinals: string[]; active?: AppActive | null; eggUsage?: number; pendingHatchID?: number | null;
  eggTier?: string | null; inventory?: Record<string, number>; usedSinceInstall?: number; spentTokens?: number;
}

/* The part of the state the pages use, as stored in this browser. */
export interface DexEntry {
  id?: string; baseID: number; finalID: number; rarity: Rarity; isShiny: boolean; releasedAt: 0 | 1;
  /** Species of the line this entry reached, base first. Missing in saves stored by old versions. */
  chain: number[]; caughtAt: number | null; unownForm: string | null;
}
export interface Active {
  baseID: number; rarity: Rarity; isShiny: boolean; path: number[]; stage: number; planned: number[];
  forms: number; used: number; boost: boolean; unownForm: string | null;
}
export interface State {
  collectedFinals: string[]; dex: DexEntry[]; active: Active | null; eggUsage: number;
  pendingHatchID: number | null; eggTier: string | null; inventory: Record<string, number>;
  usedSinceInstall: number; spentTokens: number;
}
export interface Save { at: number; st: State }

export const SAVE_KEY = 'poketokenbar-save-v2';
export function readStoredSave(): Save | null {
  try { const v = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return v && v.st ? v : null; } catch { return null; }
}
function storeSave(v: Save) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch {} }
export function forgetSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }

const appleDate = (t: unknown) => typeof t === 'number' ? Math.round((t + 978307200) * 1000) : typeof t === 'string' ? Date.parse(t) || null : null;
function compactState(st: AppState): State {
  return {
    collectedFinals: st.collectedFinals || [],
    dex: st.dex.map(d => ({id: d.id, baseID: d.baseID, finalID: d.finalID, rarity: d.rarity, isShiny: !!d.isShiny,
      releasedAt: d.releasedAt ? 1 : 0, chain: d.chainOrder || [d.baseID], caughtAt: appleDate(d.caughtAt), unownForm: d.unownForm || null})),
    active: st.active ? {baseID: st.active.baseID, rarity: st.active.rarity, isShiny: !!st.active.isShiny,
      path: st.active.pathIDs || [], stage: st.active.stageIndex || 0, planned: st.active.plannedPathIDs || st.active.pathIDs || [],
      forms: st.active.totalForms || 1, used: st.active.usedAtStage || 0, boost: !!st.active.hasGrowthBoost,
      unownForm: st.active.unownForm || null} : null,
    eggUsage: st.eggUsage || 0,
    pendingHatchID: st.pendingHatchID ?? null, eggTier: st.eggTier ?? null,
    inventory: st.inventory || {}, usedSinceInstall: st.usedSinceInstall || 0, spentTokens: st.spentTokens || 0,
  };
}
/** Reads an export of the app, or its companion-state.json, and keeps it for every page. */
export async function readSaveFile(f: {text(): Promise<string>; lastModified: number}): Promise<Save> {
  const raw = JSON.parse(await f.text());
  const exported = raw.format === 'poketokenbar.save';
  const st: AppState = exported ? raw.state : raw;
  if (!st || !Array.isArray(st.dex) || !Array.isArray(st.collectedFinals)) throw new Error('not a PokeTokenBar save');
  const v = {at: exported ? Date.parse(raw.exportedAt) || f.lastModified : f.lastModified, st: compactState(st)};
  storeSave(v);
  return v;
}

/* What serve.py answered last time, so a page first renders with it instead of jumping when the fresh answer lands. */
const LAST_KEY = 'tokendex-last-v1:';
export function lastServed<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(LAST_KEY + key) || 'null'); } catch { return null; }
}
function keepServed(key: string, v: unknown) {
  try { if (v == null) localStorage.removeItem(LAST_KEY + key); else localStorage.setItem(LAST_KEY + key, JSON.stringify(v)); } catch {}
}

/* Served by serve.py: save.json is the app's live companion-state.json, read again on every request. */
export async function fetchServedSave(): Promise<Save | null> {
  let v: Save | null = null;
  try {
    const r = await fetch('save.json', {cache: 'no-store'});
    if (r.ok) v = await readSaveFile({text: () => r.text(), lastModified: Date.parse(r.headers.get('Last-Modified') || '') || Date.now()});
  } catch {}
  keepServed('live', !!v);
  return v;
}
export async function fetchServedJSON<T>(path: string): Promise<T | null> {
  let v: T | null = null;
  try { const r = await fetch(path, {cache: 'no-store'}); if (r.ok) v = await r.json(); } catch {}
  keepServed(path, v);
  return v;
}

/** The app's growth and shop sliders in percent. */
export interface Settings { g: number; s: number; live?: boolean }
const SETTINGS_KEY = 'poketokenbar-settings-v1';
export function storedSettings(): Settings {
  try { const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); if (v && v.g && v.s) return {g: v.g, s: v.s}; } catch {}
  return {g: 100, s: 100};
}
export function storeSettings(v: Settings) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({g: v.g, s: v.s})); } catch {} }
// Live from serve.py, else the last values typed on Prochains.
type AppSettings = {growth: number; shop: number};
const liveSettings = (v: AppSettings | null): Settings | null => v && {g: v.growth, s: v.shop, live: true};
export async function appSettings(): Promise<Settings> {
  const v = liveSettings(await fetchServedJSON<AppSettings>('settings.json'));
  if (!v) return storedSettings();
  storeSettings(v);
  return v;
}
export const lastSettings = () => liveSettings(lastServed<AppSettings>('settings.json')) || storedSettings();
