import {useEffect, useState} from 'preact/hooks';
import {SAVE_KEY, appSettings, fetchServedJSON, fetchServedSave, readStoredSave, storedSettings, type Settings} from './save';

/* Runs `refresh` now, when the tab comes back, and every `everyMs` if given. */
function useRefresh(refresh: () => void, everyMs?: number) {
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = everyMs ? setInterval(refresh, everyMs) : 0;
    refresh();
    return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(timer); };
  }, []);
}

/** The save: the stored one first, then the app's live one whenever it changed. `live` is true once serve.py answered. */
export function useSave(everyMs?: number) {
  const [save, setSave] = useState(readStoredSave);
  const [live, setLive] = useState(false);
  useRefresh(async () => {
    const before = readStoredSave(), v = await fetchServedSave();
    setLive(!!v);
    if (v && (!before || before.at !== v.at)) setSave(v);
  }, everyMs);
  // The home page, open in another tab, loads or forgets a save.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === SAVE_KEY || e.key === null) setSave(readStoredSave()); };
    addEventListener('storage', onStorage);
    return () => removeEventListener('storage', onStorage);
  }, []);
  return {save, setSave, live};
}

export function useSettings(everyMs?: number) {
  const [settings, setSettings] = useState<Settings>(storedSettings);
  useRefresh(async () => setSettings(await appSettings()), everyMs);
  return [settings, setSettings] as const;
}

/** A JSON file served by serve.py, or null until it answers (or if it never does). */
export function useServed<T>(path: string, everyMs?: number) {
  const [data, setData] = useState<T | null>(null);
  useRefresh(async () => { const v = await fetchServedJSON<T>(path); if (v) setData(v); }, everyMs);
  return data;
}
