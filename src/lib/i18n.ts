// Interface language: the menu's toggle picks it, else the browser does.
export type Lang = 'fr' | 'en';
const LANG_KEY = 'tokendex-lang';
export const LANG: Lang = (() => {
  try { const l = localStorage.getItem(LANG_KEY); if (l === 'fr' || l === 'en') return l; } catch {}
  return /^fr\b/i.test(navigator.language) ? 'fr' : 'en';
})();
export const LOCALE = LANG === 'fr' ? 'fr-FR' : 'en-US';
document.documentElement.lang = LANG;
export const tr = <T,>(fr: T, en: T): T => LANG === 'fr' ? fr : en;
export function setLang(l: Lang) { try { localStorage.setItem(LANG_KEY, l); } catch {} location.reload(); }
