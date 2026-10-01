import {useEffect, useState} from 'preact/hooks';
import {SAVE_KEY, appSettings, fetchServedJSON, fetchServedSave, lastServed, lastSettings, readStoredSave, type Settings} from './save';

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

/** The save: the stored one first, then the app's live one whenever it changed. `live`: serve.py serves it (as last time until it answers). */
export function useSave(everyMs?: number) {
  const [save, setSave] = useState(readStoredSave);
  const [live, setLive] = useState(() => lastServed<boolean>('live') ?? false);
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
  const [settings, setSettings] = useState<Settings>(lastSettings);
  useRefresh(async () => setSettings(await appSettings()), everyMs);
  return [settings, setSettings] as const;
}

/** A JSON file served by serve.py: its last answer, then the fresh one, or null if it does not answer. */
export function useServed<T>(path: string, everyMs?: number) {
  const [data, setData] = useState(() => lastServed<T>(path));
  useRefresh(async () => setData(await fetchServedJSON<T>(path)), everyMs);
  return data;
}
