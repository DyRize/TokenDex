import './page.css';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Header, Tiles, mount, saveEyebrow} from '../../components/Page';
import {RLABEL} from '../../components/Rarity';
import {NAMES, RAR} from '../../data/species';
import {useSave} from '../../lib/hooks';
import {LOCALE, tr} from '../../lib/i18n';
import {forgetSave, readSaveFile, type Active, type Rarity, type Save} from '../../lib/save';
import {bwSprite, spriteID} from '../../lib/sprites';

const RAR_KEY: Record<string, Rarity> = {l: 'legendary', r: 'rare', u: 'uncommon', c: 'common'};
const GENS: [string, number, number][] = [['Kanto', 1, 151], ['Johto', 152, 251], ['Hoenn', 252, 386], ['Sinnoh', 387, 493], [tr('Unys', 'Unova'), 494, 649]];
const SEEN_KEY = 'poketokenbar-pokedex-seen-v1';
const AUTO_KEY = 'poketokenbar-pokedex-wtp-auto-v1';
const pad = (n: number) => String(n).padStart(3, '0');
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(LOCALE, {day: 'numeric', month: 'long', year: 'numeric'});
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function readSeen() { try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); return Array.isArray(v) ? new Set<number>(v) : null; } catch { return null; } }
function writeSeen(seen: Set<number>) { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch {} }

interface Got { name: string; shiny: boolean; at: number; forms?: Set<string>; form?: string | null; growing?: boolean }
interface Dex { got: Map<number, Got>; cur: Set<number>; lastId: number | null; active: Active | null }
function buildDex(v: Save): Dex | null {
  const st = v.st, got = new Map<number, Got>();
  if (st.dex.some(d => !d.chain)) return null;
  for (const d of st.dex) for (const id of d.chain) {
    if (id > 649) continue;
    const g = got.get(id);
    if (!g) got.set(id, {name: NAMES[id - 1], shiny: d.isShiny, at: d.caughtAt || 0});
    else { g.shiny = g.shiny || d.isShiny; if (d.caughtAt && (!g.at || d.caughtAt < g.at)) g.at = d.caughtAt; }
  }
  // Unown letters, the growing one included like the app does. The tile shows the latest letter.
  const unown = st.dex.filter(d => d.chain.includes(201)).sort((a, b) => (a.caughtAt || 0) - (b.caughtAt || 0));
  if (unown.length) {
    const forms = new Set(unown.map(d => d.unownForm || 'a'));
    if (st.active && st.active.path.slice(0, st.active.stage + 1).includes(201)) forms.add(st.active.unownForm || 'a');
    Object.assign(got.get(201)!, {forms, form: unown[unown.length - 1].unownForm || 'a'});
  }
  const cur = new Set(st.active ? st.active.path.slice(0, st.active.stage + 1) : []);
  const lastEntry = st.dex.filter(d => d.caughtAt).sort((a, b) => b.caughtAt! - a.caughtAt!)[0];
  const lastId = lastEntry ? lastEntry.chain.filter(id => id <= 649).pop() ?? null : null;
  return {got, cur, lastId, active: st.active};
}
// Caught species, or a stage of the Pokémon growing right now (seen but not in the Pokédex yet).
function info(dex: Dex, id: number): Got | null {
  const g = dex.got.get(id);
  if (g) return g;
  return dex.cur.has(id) && dex.active ? {name: NAMES[id - 1], shiny: dex.active.isShiny, at: 0, growing: true, form: dex.active.unownForm} : null;
}
// Species caught since the reveals this browser remembers. The first visit remembers everything as seen.
function unseenAtLoad(dex: Dex) {
  const stored = readSeen(), ids = [...dex.got.keys()];
  if (stored) return new Set(ids.filter(id => !stored.has(id)));
  writeSeen(new Set(ids));
  return new Set<number>();
}
function markSeen(ids: number[]) { const seen = readSeen() || new Set(); ids.forEach(id => seen.add(id)); writeSeen(seen); }

/* ---------- Quel est ce Pokémon ? ---------- */
function Wtp({dex, ids, onSeen, onClose}: {dex: Dex; ids: number[]; onSeen: (ids: number[]) => void; onClose: () => void}) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const id = ids[i], g = info(dex, id), left = ids.length - 1 - i;
  const reveal = () => { if (!g || shown) return; setShown(true); onSeen([id]); };
  const next = () => {
    if (g && !shown) return reveal();
    if (!left) return onClose();
    setI(i + 1); setShown(false);
  };
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  useEffect(() => {
    if (!g || shown) return;
    new Image().src = bwSprite(spriteID(id, g.form), {shiny: g.shiny, animated: true});
    const timer = setTimeout(reveal, reduced ? 300 : 1800);
    return () => clearTimeout(timer);
  }, [i, shown]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  const tags: [string, string?][] = shown && g ? [
    [RLABEL[RAR_KEY[RAR[id - 1]]], RAR_KEY[RAR[id - 1]]], ...(g.shiny ? [['Shiny', 'legendary'] as [string, string]] : []),
    ...(g.forms ? [[`${g.forms.size}/28 ${tr('lettres', 'letters')}`] as [string]] : []),
  ] : [];
  const no = shown || !g ? `${tr('N°', 'No.')} ${pad(id)}` : '';
  const meta = !g ? tr('Pas encore dans ton Pokédex', 'Not in your Pokédex yet') : !shown ? ''
    : g.growing ? tr('En train de grandir, pas encore au Pokédex', 'Growing, not in the Pokédex yet') : g.at ? tr('Obtenu le ', 'Caught on ') + fmtDay(g.at) : '';
  return (
    <div class={shown ? 'wtp shown flash' : 'wtp'} role="dialog" aria-modal="true" aria-label={tr('Quel est ce Pokémon ?', 'Who\'s that Pokémon?')}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="wtp-card">
        <div class="wtp-stage"><img alt="" onClick={reveal}
          src={bwSprite(spriteID(id, g && g.form), shown && g ? {shiny: g.shiny, animated: true} : {})} /></div>
        <div class="wtp-text">
          <span class="wtp-no">{no}</span>
          <span class="q">{tr('Quel est ce Pokémon\u00a0?', 'Who\'s that Pokémon?')}</span>
          <span class="nm">{g ? tr(`C'est ${g.name}\u00a0!`, `It's ${g.name}!`) : ''}</span>
          <span class="wtp-tags">{tags.map(([text, r]) => <span style={r ? `--c:var(--r-${r})` : undefined}>{text}</span>)}</span>
          <span class="wtp-meta">{meta}</span>
        </div>
        <div class="wtp-actions">
          {left > 0 && <button type="button" class="btn" onClick={() => { onSeen(ids.slice(i)); onClose(); }}>{tr('Tout révéler', 'Reveal all')}</button>}
          <button type="button" class="btn" onClick={next}>{left ? `${tr('Suivant', 'Next')} (${left})` : tr('Fermer', 'Close')}</button>
        </div>
        <div class="wtp-flash"></div>
      </div>
    </div>
  );
}

function Mon({dex, id, isNew, onOpen}: {dex: Dex; id: number; isNew: boolean; onOpen: () => void}) {
  const g = info(dex, id), hidden = !g || isNew;
  const cls = ['mon', hidden && 'miss', isNew && 'new', g && g.shiny && !hidden && 'shiny', dex.cur.has(id) && 'cur'].filter(Boolean).join(' ');
  const label = hidden ? (isNew ? tr(`Numéro ${id}, nouvelle capture à révéler`, `Number ${id}, new catch to reveal`) : tr(`Numéro ${id}, pas encore obtenu`, `Number ${id}, not caught yet`))
    : tr(`${g.name}, numéro ${id}`, `${g.name}, number ${id}`);
  return (
    <button type="button" class={cls} style={`--c:var(--r-${RAR_KEY[RAR[id - 1]]})`} aria-label={label} onClick={onOpen}>
      <span class="no">{`#${pad(id)}`}</span>{!hidden && <i class="dot"></i>}
      <img loading="lazy" alt="" src={bwSprite(spriteID(id, g && g.form), {shiny: !!g && g.shiny && !hidden})} />
      <span class="nm">{hidden ? '???' : g.name + (g.forms ? ` ${g.forms.size}/28` : '')}</span>
    </button>
  );
}

function Grid({dex, unseen, onOpen}: {dex: Dex; unseen: Set<number>; onOpen: (ids: number[]) => void}) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [auto, setAuto] = useState(() => { try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch { return true; } });
  const q = query.trim().toLowerCase().replace(/^#/, '');
  const keep = (id: number) => {
    const g = info(dex, id), shown = g && !unseen.has(id);
    if (filter === 'got' && !g) return false;
    if (filter === 'miss' && g) return false;
    if (!q) return true;
    if (/^\d+$/.test(q)) return String(id).includes(String(+q));
    return !!shown && g.name.toLowerCase().includes(q);
  };
  const gens = GENS.map(([name, a, b]) => {
    const ids: number[] = []; for (let i = a; i <= b; i++) if (keep(i)) ids.push(i);
    let n = 0; for (let i = a; i <= b; i++) if (dex.got.has(i)) n++;
    return ids.length > 0 && (
      <section class="panel gen" aria-label={name}>
        <div class="gen-head">
          <h2>{name}</h2>
          <span class="count">{`${n} / ${b - a + 1}`}</span><span class="prog"><i style={`width:${(n / (b - a + 1) * 100).toFixed(1)}%`}></i></span>
        </div>
        <div class="dex">{ids.map(id => <Mon dex={dex} id={id} isNew={unseen.has(id)} onOpen={() => onOpen([id])} />)}</div>
      </section>
    );
  }).filter(Boolean);
  return <>
    <section class="panel" aria-label={tr('Filtres', 'Filters')}>
      <div class="toolbar">
        <div class="seg" role="radiogroup" aria-label={tr('Affichage', 'Show')}>
          {[['all', tr('Tous', 'All')], ['got', tr('Obtenus', 'Caught')], ['miss', tr('Manquants', 'Missing')]].map(([f, label]) => (
            <button type="button" class={f === filter ? 'on' : undefined} aria-checked={f === filter} onClick={() => setFilter(f)}>{label}</button>
          ))}
        </div>
        <input type="search" placeholder={tr('Numéro ou nom…', 'Number or name…')} aria-label={tr('Chercher un Pokémon', 'Search for a Pokémon')} value={query} onInput={e => setQuery(e.currentTarget.value)} />
        <label class="check">
          <input type="checkbox" checked={auto} onChange={e => { const on = e.currentTarget.checked; setAuto(on); try { localStorage.setItem(AUTO_KEY, on ? '1' : '0'); } catch {} }} />
          {' '}<span>{tr('Révélation à l\'arrivée', 'Reveal on load')}</span>
        </label>
      </div>
    </section>
    {gens.length ? gens : <section class="panel"><p class="empty">{tr('Aucun Pokémon ne correspond.', 'No Pokémon matches.')}</p></section>}
  </>;
}

function SaveHead({dex, unseen}: {dex: Dex; unseen: Set<number>}) {
  const got = dex.got, shinies = [...got.values()].filter(g => g.shiny).length;
  const last = dex.lastId ? got.get(dex.lastId) : undefined;
  return <>
    <Tiles items={[
      ['Pokédex', `${got.size} / 649`, (got.size / 649 * 100).toLocaleString(LOCALE, {minimumFractionDigits: 1, maximumFractionDigits: 1}) + tr(' % complété', '% complete')],
      ['Shiny', String(shinies), shinies ? tr('espèces obtenues en shiny', 'species caught as shiny') : tr('aucun pour l\'instant', 'none yet')],
      [tr('Dernière capture', 'Latest catch'), last && !unseen.has(dex.lastId!) ? last.name : '???', last && last.at ? fmtDay(last.at) : ''],
      [tr('En cours', 'Growing'), dex.active ? NAMES[dex.active.path[dex.active.stage] - 1] : tr('Œuf', 'Egg'), dex.active ? tr('entouré en pointillés', 'dotted outline') : tr('dans l\'œuf', 'still in the egg')],
    ]} />
    <div class="caps">
      {['l', 'r', 'u', 'c'].map(r => {
        let n = 0, t = 0; for (let i = 1; i <= 649; i++) if (RAR[i - 1] === r) { t++; if (got.has(i)) n++; }
        return <span class="cap" style={`--c:var(--r-${RAR_KEY[r]})`}><i></i>{RLABEL[RAR_KEY[r]] + ' '}<b>{n}</b>{` / ${t}`}</span>;
      })}
    </div>
  </>;
}

function App() {
  const {save, setSave, live} = useSave();
  const file = useRef<HTMLInputElement>(null);
  const dex = useMemo(() => save && buildDex(save), [save]);
  const atLoad = useMemo(() => dex ? unseenAtLoad(dex) : new Set<number>(), [dex]);
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  const unseen = new Set([...atLoad].filter(id => !revealed.has(id)));
  const [wtp, setWtp] = useState<{ids: number[]; key: number} | null>(null);
  const open = (ids: number[]) => setWtp(w => ({ids, key: (w ? w.key : 0) + 1}));
  const byCatch = (ids: Set<number>) => [...ids].sort((a, b) => dex!.got.get(a)!.at - dex!.got.get(b)!.at);
  const onSeen = (ids: number[]) => { markSeen(ids); setRevealed(prev => new Set([...prev, ...ids])); };
  useEffect(() => {
    let auto = true; try { auto = localStorage.getItem(AUTO_KEY) !== '0'; } catch {}
    if (atLoad.size && auto) open(byCatch(atLoad));
  }, [atLoad]);
  const load = async (f: File) => {
    try { setSave(await readSaveFile(f)); } catch { alert(tr('Fichier illisible : ce n\'est pas une sauvegarde PokeTokenBar.', 'Unreadable file: this is not a PokeTokenBar save.')); }
  };
  useEffect(() => {
    const over = (e: DragEvent) => { e.preventDefault(); document.body.classList.add('dragging'); };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); };
    const drop = (e: DragEvent) => {
      e.preventDefault(); document.body.classList.remove('dragging');
      const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) load(f);
    };
    document.addEventListener('dragover', over); document.addEventListener('dragleave', leave); document.addEventListener('drop', drop);
    return () => { document.removeEventListener('dragover', over); document.removeEventListener('dragleave', leave); document.removeEventListener('drop', drop); };
  }, []);
  return <>
    <div class="wrap">
      <Header eyebrow={saveEyebrow(dex ? save : null)} title={tr('Ton Pokédex', 'Your Pokédex')} save={save}
        lede={tr('Les 649 espèces de l\'app, de Bulbizarre à Genesect. Celles qui te manquent restent en ombre chinoise, et chaque capture faite depuis ta dernière visite a droit à son « Quel est ce Pokémon ? ». Clique sur une carte pour revoir la révélation.',
          'The app\'s 649 species, from Bulbasaur to Genesect. The ones you\'re missing stay as silhouettes, and every catch since your last visit gets its own “Who\'s that Pokémon?”. Click a card to see the reveal again.')} />
      <section class="panel" aria-label={tr('Ta sauvegarde', 'Your save')}>
        {!save && tr(
          <p class="empty"><b>Aucune sauvegarde chargée.</b> Exporte-la depuis l'app (Réglages, <b>Exporter la sauvegarde</b>) puis charge le fichier ou glisse-le n'importe où sur la page. Elle reste dans ce navigateur et sert à toutes les pages.</p>,
          <p class="empty"><b>No save loaded.</b> Export it from the app (Settings, <b>Export save</b>), then load the file or drop it anywhere on the page. It stays in this browser and feeds every page.</p>)}
        {save && !dex && tr(
          <p class="empty"><b>Sauvegarde à recharger.</b> Celle gardée par ce navigateur date d'une ancienne version de TokenDex, qui ne retenait pas les évolutions. Recharge-la une fois.</p>,
          <p class="empty"><b>Save needs reloading.</b> The one kept by this browser comes from an older version of TokenDex that did not keep evolutions. Load it again once.</p>)}
        {dex && <SaveHead dex={dex} unseen={unseen} />}
        <div class="save-row">
          {!live && <button type="button" class="btn" onClick={() => file.current!.click()}>{save ? tr('Charger une autre sauvegarde…', 'Load another save…') : tr('Charger ma sauvegarde…', 'Load my save…')}</button>}
          {!live && save && <button type="button" class="btn" onClick={() => { forgetSave(); setSave(null); }}>{tr('Oublier', 'Forget')}</button>}
          <input type="file" ref={file} accept=".json,application/json" hidden onChange={e => { const f = e.currentTarget.files![0]; if (f) load(f); e.currentTarget.value = ''; }} />
          {live
            ? <span class="hint">{tr('Suivie en direct : la sauvegarde de l\'app est relue à chaque ouverture de page.', 'Live: the app\'s save is read again every time a page opens.')}</span>
            : <span class="hint">{tr(<>Le <code>companion-state.json</code> de <code>~/Library/Application Support/PokeTokenBar/</code> marche aussi.</>, <>The <code>companion-state.json</code> in <code>~/Library/Application Support/PokeTokenBar/</code> works too.</>)}</span>}
        </div>
        {unseen.size > 0 && (
          <div class="newbar">
            <span>{tr(<><b>{`${unseen.size} nouvelle${unseen.size > 1 ? 's' : ''} capture${unseen.size > 1 ? 's' : ''}`}</b> depuis ta dernière visite.</>,
              <><b>{`${unseen.size} new catch${unseen.size > 1 ? 'es' : ''}`}</b> since your last visit.</>)}</span>
            <button type="button" class="btn primary" onClick={() => open(byCatch(unseen))}>{tr('Révéler', 'Reveal')}</button>
          </div>
        )}
      </section>
      {dex && <Grid dex={dex} unseen={unseen} onOpen={open} />}
      <footer>
        {tr(<>
          <p>Une espèce compte comme obtenue dès qu'elle est dans ton Pokédex, c'est-à-dire dans la chaîne d'évolution d'un Pokémon gradué. Le Pokémon que tu fais grandir en ce moment est entouré en pointillés : ses formes déjà atteintes sont visibles, mais ne comptent qu'à la graduation. Les révélations déjà vues sont retenues par ce navigateur.</p>
          <p>Sprites : PokeAPI/sprites, Noir &amp; Blanc (animés à la révélation). Noms : PokéAPI.</p>
        </>, <>
          <p>A species counts as caught as soon as it is in your Pokédex, that is, in the evolution line of a graduated Pokémon. The Pokémon you're growing right now has a dotted outline: the forms it has reached are shown, but they only count once it graduates. Reveals you've already seen are remembered by this browser.</p>
          <p>Sprites: PokeAPI/sprites, Black &amp; White (animated on reveal). Names: PokéAPI.</p>
        </>)}
      </footer>
    </div>
    {wtp && dex && <Wtp key={wtp.key} dex={dex} ids={wtp.ids} onSeen={onSeen} onClose={() => setWtp(null)} />}
  </>;
}

mount(tr('Ton Pokédex', 'Your Pokédex'), App);
