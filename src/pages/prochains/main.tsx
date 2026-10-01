import './page.css';
import {useMemo, useState} from 'preact/hooks';
import {Header, NoSave, Tiles, mount, saveEyebrow, type TileData} from '../../components/Page';
import {RLABEL, RarityTag} from '../../components/Rarity';
import {LINE_ROWS} from '../../data/lines';
import {NAMES} from '../../data/species';
import {EGG_COST, GRAD, PRICE} from '../../lib/balance';
import {tok} from '../../lib/format';
import {useSave, useSettings} from '../../lib/hooks';
import {LANG, LOCALE, tr} from '../../lib/i18n';
import {storeSettings, type Rarity, type Settings, type State} from '../../lib/save';
import {bwSprite} from '../../lib/sprites';
import {nextEgg, weight, type Egg} from './draw';

interface Line { id: number; name: string; cr: number; leg: boolean; rarity: Rarity }
const LINES: Line[] = LINE_ROWS.map(([id, cr, leg]) => ({
  id, name: NAMES[id - 1], cr, leg: !!leg,
  rarity: leg ? 'legendary' : cr <= 45 ? 'rare' : cr <= 120 ? 'uncommon' : 'common',
}));
const BY_ID = new Map(LINES.map(l => [l.id, l]));
const RARITIES = Object.keys(RLABEL) as Rarity[];
const EGGS: Record<Egg, {label: string; ceil: number; price: number}> = {
  none: {label: tr('Œuf normal', 'Normal Egg'), ceil: 255, price: PRICE.egg},
  uncommon: {label: tr('Œuf Peu commun+', 'Uncommon+ Egg'), ceil: 120, price: PRICE.uncommonEgg},
  rare: {label: tr('Œuf Rare+', 'Rare+ Egg'), ceil: 45, price: PRICE.rareEgg},
};
const isEgg = (k: string | null): k is Egg => k === 'none' || k === 'uncommon' || k === 'rare';

function pct(p: number) {
  if (p <= 0) return '–';
  const v = p * 100;
  const d = v >= 10 ? 1 : v >= 1 ? 2 : v >= 0.1 ? 3 : 4;
  return v.toLocaleString(LOCALE, {minimumFractionDigits: d, maximumFractionDigits: d}) + tr(' %', '%');
}
const oneIn = (p: number) => p > 0 ? Math.round(1 / p).toLocaleString(LOCALE) : '–';
function mulberry32(a: number) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* The save as this page reads it: lines by base species, and the settings the odds depend on. */
interface Sv {
  collected: number[]; shiny: number[]; active: number | null; pending: number | null; eggTier: string | null;
  charm: boolean; wallet: number; growth: number; shop: number;
}
function fromState(st: State, settings: Settings): Sv {
  const finals = st.collectedFinals, finalSet = new Set(finals);
  return {
    collected: [...new Set(finals.map(k => +k.split(':')[0]))],
    shiny: st.dex.filter(d => d.isShiny && !d.releasedAt && finalSet.has(`${d.baseID}:${d.finalID}`)).map(d => d.baseID),
    active: st.active ? st.active.baseID : null,
    pending: st.pendingHatchID, eggTier: st.eggTier,
    charm: (st.inventory.shinyCharm || 0) > 0,
    wallet: Math.max(0, st.usedSinceInstall - st.spentTokens),
    growth: settings.g / 100, shop: settings.s / 100,
  };
}
const shinyRate = (sv: Sv) => sv.charm ? 1 / 48 : 1 / 64;

// Odds that none of n eggs triggers an event, e[i] being its odds when line i hatches. Each run follows a path
// with no event so far and keeps the odds of that path, instead of counting hits: exact for one egg, and a 1 %
// event no longer swings by a fifth between runs of the same slider value.
function noEventOdds(pool: Line[], baseW: number[], half: number[], collected: Set<number>, e: number[], n: number, rnd: () => number, R: number) {
  let sum = 0;
  for (let r = 0; r < R; r++) {
    const w = baseW.slice(), got = pool.map(l => collected.has(l.id));
    let total = w.reduce((a, b) => a + b, 0), hit = w.reduce((a, x, i) => a + x * e[i], 0), q = 1;
    for (let k = 0; k < n && q > 0; k++) {
      q *= 1 - hit / total;
      let x = rnd() * (total - hit), i = 0;
      while (x >= w[i] * (1 - e[i]) && i < w.length - 1) { x -= w[i] * (1 - e[i]); i++; }
      if (!got[i]) { got[i] = true; const d = w[i] - half[i]; total -= d; hit -= d * e[i]; w[i] = half[i]; }
    }
    sum += q;
  }
  return sum / R;
}
function horizon(pool: Line[], collected: Set<number>, n: number, sv: Sv) {
  const R = 3000, rnd = mulberry32(1234 + n), s = shinyRate(sv);
  const baseW = pool.map(l => weight(l, collected));
  const half = pool.map(l => Math.max(1, Math.floor(l.cr / 2)));
  let sumNew = 0, sumCost = 0;
  for (let r = 0; r < R; r++) {
    const w = baseW.slice(), got = pool.map(l => collected.has(l.id));
    let total = w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < n; k++) {
      let x = rnd() * total, i = 0;
      while (x >= w[i] && i < w.length - 1) { x -= w[i]; i++; }
      sumCost += (GRAD[pool[i].rarity] / (got[i] ? 2 : 1) + EGG_COST) * sv.growth;
      if (!got[i]) { got[i] = true; sumNew++; total -= w[i] - half[i]; w[i] = half[i]; }
    }
  }
  const noLeg = noEventOdds(pool, baseW, half, collected, pool.map(l => l.leg ? 1 : 0), n, mulberry32(4321 + n), 1000);
  const noShinyLeg = noEventOdds(pool, baseW, half, collected, pool.map(l => l.leg ? s : 0), n, mulberry32(8765 + n), 1000);
  return {newLines: sumNew / R, anyLeg: 1 - noLeg, anyShinyLeg: 1 - noShinyLeg, anyShiny: 1 - Math.pow(1 - s, n), cost: sumCost / R};
}

function SaveTiles({sv}: {sv: Sv}) {
  const collected = new Set(sv.collected), active = sv.active ? BY_ID.get(sv.active) : undefined;
  const rarePrice = EGGS.rare.price * sv.shop;
  return <Tiles items={[
    [tr('Lignes graduées', 'Graduated lines'), `${LINES.filter(l => collected.has(l.id)).length} / ${LINES.length}`, `${LINES.filter(l => l.leg && collected.has(l.id)).length} / 48 ${tr('légendaires', 'legendaries')}`],
    [tr('En cours', 'Growing'), active ? active.name : tr('Œuf', 'Egg'), active ? RLABEL[active.rarity].toLowerCase() : undefined],
    ['Shiny', sv.charm ? '1 / 48' : '1 / 64', sv.charm ? tr('Charme Chroma', 'Shiny Charm') : tr('sans charme', 'no charm')],
    [tr('Solde boutique', 'Shop balance'), tok(sv.wallet), sv.wallet >= rarePrice ? tr('Rare+ achetable', 'Rare+ affordable') : `${tr('Rare+ à', 'Rare+ at')} ${tok(rarePrice)}`],
  ]} />;
}

function Pending({line}: {line: Line}) {
  const [shown, setShown] = useState(false);
  return (
    <div class="note spoiler">
      <span>{tr(<>L'œuf en cours est <b>déjà tiré</b> : l'espèce est écrite dans ta sauvegarde.</>, <>The current egg is <b>already drawn</b>: the species is written in your save.</>)}</span>
      {!shown && <button type="button" class="btn" onClick={() => setShown(true)}>{tr('Révéler', 'Reveal')}</button>}
      {shown && <span class="reveal">{`#${line.id} ${line.name} · ${RLABEL[line.rarity].toLowerCase()}`}</span>}
    </div>
  );
}

function Odds({sv}: {sv: Sv}) {
  const [picked, setPicked] = useState<Egg | null>(null);
  const [n, setN] = useState(20);
  const [q, setQ] = useState('');
  const [onlyNew, setOnlyNew] = useState(false);
  const [sort, setSort] = useState('p');
  const [rar, setRar] = useState(() => new Set(RARITIES));
  const egg = picked ?? (isEgg(sv.eggTier) ? sv.eggTier : 'none');
  const {pool, p, collected} = useMemo(() => nextEgg(LINES, sv.collected, sv.active, egg, EGGS[egg].ceil), [sv, egg]);
  const h = useMemo(() => horizon(pool, collected, n, sv), [pool, collected, n, sv]);
  const s = shinyRate(sv), odds = sv.charm ? 48 : 64, act = sv.active ? BY_ID.get(sv.active) : undefined;
  const by = (r: Rarity) => pool.filter(l => l.rarity === r).reduce((a, l) => a + p.get(l.id)!, 0);
  const pNew = pool.filter(l => !collected.has(l.id)).reduce((a, l) => a + p.get(l.id)!, 0);
  const nextTiles: TileData[] = [
    ...(['common', 'uncommon', 'rare'] as const).filter(r => pool.some(l => l.rarity === r)).map((r): TileData => [RLABEL[r], pct(by(r)), `shiny ${pct(by(r) * s)}`]),
    [RLABEL.legendary, pct(by('legendary')), `shiny 1 ${tr('sur', 'in')} ${oneIn(by('legendary') * s)}`, 'leg'],
    [tr('Ligne nouvelle', 'New line'), pct(pNew), `${tr('doublon', 'duplicate')} ${pct(1 - pNew)}`],
  ];
  const eggs = tr(`${n} œuf${n > 1 ? 's' : ''}`, `${n} egg${n > 1 ? 's' : ''}`);
  const query = q.trim().toLowerCase();
  const rows = pool.filter(l => rar.has(l.rarity) && (!onlyNew || !collected.has(l.id)) &&
    (!query || l.name.toLowerCase().includes(query) || String(l.id) === query.replace('#', '')));
  rows.sort(sort === 'id' ? (a, b) => a.id - b.id : sort === 'name' ? (a, b) => a.name.localeCompare(b.name, LANG)
    : (a, b) => p.get(b.id)! - p.get(a.id)! || a.id - b.id);
  const maxP = Math.max(...pool.map(l => p.get(l.id)!));
  const shinySet = new Set(sv.shiny);
  const totalW = pool.reduce((a, l) => a + weight(l, collected), 0).toLocaleString(LOCALE);
  const toggleRar = (r: Rarity) => setRar(prev => { const next = new Set(prev); next.has(r) ? next.delete(r) : next.add(r); return next; });
  return <>
    <section class="panel" aria-label={tr('Type d\'œuf', 'Egg type')}>
      <div class="modes" role="radiogroup" aria-label={tr('Type d\'œuf', 'Egg type')}>
        {(Object.entries(EGGS) as [Egg, typeof EGGS.none][]).map(([k, e]) => (
          <button key={k} type="button" class={`mode${k === egg ? ' on' : ''}`} role="radio" aria-checked={k === egg} onClick={() => setPicked(k)}>
            {e.label}<em>{`${k === 'none' ? tr('tirage libre', 'open draw') : tok(e.price * sv.shop)}${k === sv.eggTier ? tr(' · en cours', ' · current') : ''}`}</em>
          </button>
        ))}
      </div>
    </section>
    <section class="panel" aria-label={tr('Prochain œuf', 'Next egg')}>
      <div class="panel-head">
        <h2>{tr('Au prochain œuf', 'In the next egg')}</h2>
        <p>{tr(`${pool.length} lignes dans le tirage${act ? egg === 'none' ? `, ${act.name} compté comme gradué puisque l'œuf ne vient qu'après` : `, acheter cet œuf relâche ${act.name} sans le graduer` : ''}. Le shiny est tiré à part : 1 chance sur ${odds}, quelle que soit la rareté.`,
          `${pool.length} lines in the draw${act ? egg === 'none' ? `, ${act.name} counted as graduated since the egg only comes after` : `, buying this egg releases ${act.name} without graduating it` : ''}. Shiny is drawn separately: 1 in ${odds}, whatever the rarity.`)}</p>
      </div>
      <Tiles items={nextTiles} />
    </section>
    <section class="panel" aria-label="Horizon">
      <div class="panel-head">
        <h2>{tr('Sur les prochains œufs', 'Over the next eggs')}</h2>
        <p>{tr('Simulation de 3 000 suites d\'œufs du type choisi : chaque Pokémon est gradué, donc une ligne nouvelle perd la moitié de son poids dès qu\'elle sort.', 'Simulation of 3,000 runs of eggs of the chosen type: every Pokémon graduates, so a new line loses half its weight as soon as it hatches.')}</p>
      </div>
      <div class="ctl">
        <div class="ctl-top"><label class="cap" for="n">{tr('Nombre d\'œufs', 'Number of eggs')}</label><output for="n">{n}</output></div>
        <input type="range" id="n" min="1" max="100" step="1" value={n} onInput={e => setN(+e.currentTarget.value)} />
      </div>
      <Tiles items={[
        [tr('Nouvelles lignes', 'New lines'), h.newLines.toLocaleString(LOCALE, {maximumFractionDigits: 1}), tr('en moyenne', 'on average')],
        [tr('≥ 1 légendaire', '≥ 1 legendary'), pct(h.anyLeg), undefined, 'leg'],
        ['≥ 1 shiny', pct(h.anyShiny)],
        [tr('≥ 1 légendaire shiny', '≥ 1 shiny legendary'), pct(h.anyShinyLeg)],
        [tr('Croissance', 'Growth'), tok(h.cost), tr(`à ${Math.round(sv.growth * 100)} % de croissance`, `at ${Math.round(sv.growth * 100)}% growth`)],
      ]} />
    </section>
    <section class="panel" aria-label={tr('Listing', 'All lines')}>
      <div class="panel-head">
        <h2>{tr('Toutes les lignes', 'All lines')}</h2>
        <p>{tr(`Chance = poids ÷ ${totalW} (poids total du tirage). Les lignes graduées restent dans le tirage avec un poids divisé par deux. « En ${eggs} » = chance de tomber au moins une fois dessus, à poids constants.`,
          `Odds = weight ÷ ${totalW} (total weight of the draw). Graduated lines stay in the draw with half their weight. “In ${eggs}” = odds of getting it at least once, at constant weights.`)}</p>
      </div>
      <div class="filters">
        <input type="search" placeholder={tr('Chercher un Pokémon ou un n°', 'Search for a Pokémon or a No.')} aria-label={tr('Chercher', 'Search')} value={q} onInput={e => setQ(e.currentTarget.value)} />
        <span>
          {RARITIES.map((r, i) => <>
            {i > 0 && ' '}
            <button type="button" class={rar.has(r) ? 'chip on' : 'chip'} style={`--c:var(--r-${r})`} aria-pressed={rar.has(r)} onClick={() => toggleRar(r)}>{RLABEL[r]}</button>
          </>)}
        </span>
        <label class="check"><input type="checkbox" checked={onlyNew} onChange={e => setOnlyNew(e.currentTarget.checked)} /> <span>{tr('Nouvelles seulement', 'New only')}</span></label>
        <select aria-label={tr('Trier', 'Sort')} value={sort} onChange={e => setSort(e.currentTarget.value)}>
          <option value="p">{tr('Plus probables', 'Most likely')}</option>
          <option value="id">{tr('N° Pokédex', 'Pokédex No.')}</option>
          <option value="name">{tr('Nom', 'Name')}</option>
        </select>
      </div>
      <div class="scroller">
        <table class="list">
          <thead><tr>
            <th>Pokémon</th><th class="hide-sm">{tr('Rareté', 'Rarity')}</th><th class="hide-sm">{tr('Statut', 'Status')}</th><th class="num hide-sm">{tr('Poids', 'Weight')}</th>
            <th class="num">{tr('Prochain œuf', 'Next egg')}</th><th class="num hide-sm">{tr('1 sur', '1 in')}</th>
            <th class="num">{tr(`En ${eggs}`, `In ${eggs}`)}</th><th class="num hide-sm">Shiny</th>
          </tr></thead>
          <tbody>
            {rows.map(l => {
              const pr = p.get(l.id)!, done = collected.has(l.id);
              return (
                <tr key={l.id} class={done ? 'done' : ''}>
                  <td><div class="poke">
                    <img loading="lazy" alt="" src={bwSprite(l.id)} /><span class="id">{`#${l.id}`}</span><span class="nm">{l.name}</span>
                    {shinySet.has(l.id) && <> <span class="shiny" title={tr('Shiny gradué', 'Graduated shiny')}>✦</span></>}
                  </div></td>
                  <td class="hide-sm"><RarityTag rarity={l.rarity} /></td>
                  <td class="hide-sm">{sv.active === l.id ? <span class="st cur">{tr('En cours', 'Growing')}</span>
                    : done ? <span class="st">{tr('Graduée', 'Graduated')}</span> : <span class="st new">{tr('Nouvelle', 'New')}</span>}</td>
                  <td class="num hide-sm">{done ? <>{`${weight(l, collected)} `}<span class="half" title={tr(`Taux de capture ${l.cr}, divisé par deux`, `Catch rate ${l.cr}, halved`)}>{`/ ${l.cr}`}</span></> : weight(l, collected)}</td>
                  <td class="num"><div class="bar"><span>{pct(pr)}</span><span class="track"><i style={`width:${Math.max(1, pr / maxP * 100)}%`}></i></span></div></td>
                  <td class="num hide-sm">{oneIn(pr)}</td>
                  <td class="num">{pct(1 - Math.pow(1 - pr, n))}</td>
                  <td class="num hide-sm">{`1 / ${oneIn(pr * s)}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <span class="count">{tr(`${rows.length} ligne${rows.length > 1 ? 's' : ''} affichée${rows.length > 1 ? 's' : ''} sur ${pool.length}`, `${rows.length} line${rows.length > 1 ? 's' : ''} shown of ${pool.length}`)}</span>
    </section>
  </>;
}

function App() {
  const {save, live} = useSave();
  const [settings, setSettings] = useSettings();
  const sv = useMemo(() => save && fromState(save.st, settings), [save, settings]);
  const pend = sv && sv.pending ? BY_ID.get(sv.pending) : undefined;
  const onSettings = (k: 'g' | 's') => (e: Event) => {
    const v = {g: settings.g, s: settings.s, [k]: Math.min(200, Math.max(10, Math.round(+(e.currentTarget as HTMLInputElement).value || 100)))};
    storeSettings(v); setSettings(v);
  };
  return (
    <div class="wrap">
      <Header eyebrow={saveEyebrow(save)} title={tr('Tes prochains Pokémon', 'Your next Pokémon')} save={save}
        lede={tr('Les chances de chaque ligne au prochain œuf et sur les œufs suivants, calculées avec les règles de l\'app sur ta propre collection : poids = taux de capture, divisé par deux une fois la ligne graduée.', 'The odds of each line in the next egg and the ones after, computed with the app\'s rules on your own collection: weight = catch rate, halved once the line has graduated.')} />
      <section class="panel" aria-label={tr('Ta sauvegarde', 'Your save')}>
        {sv ? <SaveTiles sv={sv} /> : <NoSave />}
        {!live && <>
          <div class="save-row">
            <a class="btn" href="index.html">{save ? tr('Changer de sauvegarde', 'Change save') : tr('Charger ma sauvegarde', 'Load my save')}</a>
            <span class="hint">{tr('La sauvegarde se charge depuis l\'accueil et sert à toutes les pages.', 'The save is loaded from the home page and feeds every page.')}</span>
          </div>
          <div class="settings">
            <label><span>{tr('Croissance', 'Growth')}</span> <input type="number" min="10" max="200" step="5" value={settings.g} onChange={onSettings('g')} /> %</label>
            <label><span>{tr('Boutique', 'Shop')}</span> <input type="number" min="10" max="200" step="5" value={settings.s} onChange={onSettings('s')} /> %</label>
            <span class="hint">{tr('Tes réglages de l\'app : ils ne sont pas dans la sauvegarde, ils servent aux prix et à la croissance.', 'Your app settings: they are not in the save, they drive prices and growth.')}</span>
          </div>
        </>}
        {pend && <Pending key={pend.id} line={pend} />}
      </section>
      {sv && <Odds sv={sv} />}
      <footer>
        {tr(<>
          <p>Règles reprises de <code>CompanionStore.chooseBase</code> : 328 lignes de base jusqu'au #649, Métamorph exclu, poids = <code>capture_rate</code>, divisé par deux (arrondi bas, minimum 1) quand la ligne a déjà été graduée. Les œufs Peu commun+ et Rare+ ne gardent que les <code>capture_rate ≤ 120</code> et <code>≤ 45</code>, ce qui inclut les légendaires. Shiny tiré à part : 1/48 avec le Charme Chroma, 1/64 sans.</p>
          <p>Non modélisés : le déguisement de Métamorph (1/128 sur les communs à évolution) et les lettres de Zarbi. Noms et taux de capture : PokéAPI. Sprites : PokeAPI/sprites, Noir &amp; Blanc.</p>
        </>, <>
          <p>Rules taken from <code>CompanionStore.chooseBase</code>: 328 base lines up to #649, Ditto excluded, weight = <code>capture_rate</code>, halved (rounded down, minimum 1) once the line has graduated. Uncommon+ and Rare+ Eggs only keep <code>capture_rate ≤ 120</code> and <code>≤ 45</code>, legendaries included. Shiny is drawn separately: 1/48 with the Shiny Charm, 1/64 without.</p>
          <p>Not modeled: Ditto's disguise (1/128 on commons that evolve) and Unown letters. Names and catch rates: PokéAPI. Sprites: PokeAPI/sprites, Black &amp; White.</p>
        </>)}
      </footer>
    </div>
  );
}

mount(tr('Tes prochains Pokémon', 'Your next Pokémon'), App);
