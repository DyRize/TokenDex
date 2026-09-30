// Interface language, loaded in <head> before anything else. The menu's toggle picks it, else the browser does.
const LANG_KEY = 'tokendex-lang';
const LANG = (() => {
  try { const l = localStorage.getItem(LANG_KEY); if (l === 'fr' || l === 'en') return l; } catch (e) {}
  return /^fr\b/i.test(navigator.language) ? 'fr' : 'en';
})();
const LOCALE = LANG === 'fr' ? 'fr-FR' : 'en-US';
document.documentElement.lang = LANG;
const tr = (fr, en) => LANG === 'fr' ? fr : en;
function setLang(l) { try { localStorage.setItem(LANG_KEY, l); } catch (e) {} location.reload(); }

/* Pages are written in French. An element's English sits next to it: data-en for its content (HTML),
   data-en-<attribute> for an attribute. Each page calls translatePage() once its markup is parsed,
   before its own scripts write anything, and the text stays hidden until then so French never flashes. */
const hideUntranslated = LANG === 'en' && document.head.appendChild(Object.assign(document.createElement('style'), {textContent: '[data-en]{visibility:hidden}'}));
function translatePage() {
  if (!hideUntranslated) return;
  for (const el of document.querySelectorAll('*')) for (const a of [...el.attributes]) {
    if (a.name === 'data-en') el.innerHTML = a.value;
    else if (a.name.startsWith('data-en-')) el.setAttribute(a.name.slice(8), a.value);
  }
  hideUntranslated.remove();
}
