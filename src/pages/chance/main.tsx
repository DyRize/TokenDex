import './page.css';
import type {ComponentChildren} from 'preact';
import {useLayoutEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Header, NoSave, Tiles, mount, saveEyebrow, type TileData} from '../../components/Page';
import {RarityTag} from '../../components/Rarity';
import {NAMES} from '../../data/species';
import {useSave, useServed} from '../../lib/hooks';
import {LANG, LOCALE, tr} from '../../lib/i18n';
import {bwSprite, spriteID, withForm} from '../../lib/sprites';
import type {Egg} from '../prochains/draw';
import {knownEggs, type Purchase} from './eggs';
import {BY_ID, DITTO, FAV_TOP, LINES, criteria, luckAfterEach, luckScore, possibleEggs, replay, type Criterion, type CriterionKey, type Hatch} from './luck';

const DITTO_NAME = NAMES[DITTO - 1];
const CHARM_KEY = 'poketokenbar-charm-from-v1';
const EGGS_KEY = 'poketokenbar-bought-eggs-v1';
const EGG_NAME: Record<Egg, string> = {none: tr('Œuf Pokémon', 'Pokémon Egg'), uncommon: tr('Œuf peu commun', 'Uncommon Egg'), rare: tr('Œuf rare', 'Rare Egg')};
const nf = new Intl.NumberFormat(LOCALE);
const num = (v: number, d = 1) => v.toLocaleString(LOCALE, {maximumFractionDigits: d});
const oneIn = (p: number) => p > 0 ? tr('1 sur ', '1 in ') + nf.format(Math.round(1 / p)) : '–';
const pctTxt = (p: number) => Math.round(p * 100) + tr(' %', '%');

const hatchName = (h: Hatch) => { const l = BY_ID.get(h.e.base); return h.ditto ? DITTO_NAME : l ? withForm(l.name, h.e.base, h.e.form) : '#' + h.e.base; };
const hatchSprite = (h: Hatch) => bwSprite(h.ditto ? DITTO : spriteID(h.e.base, h.e.form));

interface Metric extends Criterion { name: string; sub?: ComponentChildren }
const verdict = (p: number) => p >= .8 ? tr('très chanceux', 'very lucky') : p >= .6 ? tr('chanceux', 'lucky') : p > .4 ? tr('dans la moyenne', 'average') : p > .2 ? tr('malchanceux', 'unlucky') : tr('très malchanceux', 'very unlucky');

function MetricRow({x}: {x: Metric}) {
  const all = x.obs + x.paid;
  const obs = LANG === 'fr' ? (x.key === 'new'
    ? <><b>{nf.format(all)}</b>{` doublon${all > 1 ? 's' : ''} · ${num(x.exp)} attendus`}</>
    : <><b>{nf.format(all)}</b>{` obtenu${all > 1 ? 's' : ''} · ${num(x.exp, x.exp < 1 ? 2 : 1)} attendu${x.exp >= 2 ? 's' : ''}`}</>)
    : x.key === 'new' ? <><b>{nf.format(all)}</b>{` duplicate${all > 1 ? 's' : ''} · ${num(x.exp)} expected`}</>
    : <><b>{nf.format(all)}</b>{` caught · ${num(x.exp, x.exp < 1 ? 2 : 1)} expected`}</>;
  return (
    <div class="metric">
      <div class="name">{x.name}{x.sub && <span>{x.sub}</span>}</div>
      <div class="obs">{obs}{!!x.paid && <span>{tr(`dont ${nf.format(x.paid)} d'${x.paid > 1 ? 'œufs achetés' : 'un œuf acheté'} de type inconnu, hors calcul`, `${nf.format(x.paid)} of them from ${x.paid > 1 ? 'bought eggs' : 'a bought egg'} of unknown type, not counted`)}</span>}</div>
      <div>
        <div class="meter" role="img" aria-label={`${x.name}${tr(' : ', ': ')}${pctTxt(x.p)}`}><div class="fill" style={`width:${x.p * 100}%`}></div><div class="mid"></div></div>
        <span class="verdict">{verdict(x.p)}</span>
      </div>
      <div class="pct">{pctTxt(x.p)}</div>
    </div>
  );
}

const cnt = (arr: Hatch[], f: (h: Hatch) => boolean) => arr.filter(f).length;

function eggTypes(bought: Hatch[]) {
  const [log, player, unknown] = (['log', 'player', 'unknown'] as const).map(from => cnt(bought, h => h.eggFrom === from));
  const parts = tr(
    [log && `${nf.format(log)} du journal`, player && `${nf.format(player)} choisi${player > 1 ? 's' : ''} par toi`, unknown && `${nf.format(unknown)} inconnu${unknown > 1 ? 's' : ''}`],
    [log && `${nf.format(log)} from the log`, player && `${nf.format(player)} chosen by you`, unknown && `${nf.format(unknown)} unknown`]);
  return tr('type : ', 'type: ') + parts.filter(Boolean).join(', ');
}

function saveTiles(hs: Hatch[], charm: boolean, charmFrom: number) {
  const bought = hs.filter(h => h.purchased);
  const loved = hs.filter(h => !h.ditto && BY_ID.has(h.e.base)).sort((a, b) => BY_ID.get(a.e.base)!.rank - BY_ID.get(b.e.base)!.rank)[0];
  const tiles: TileData[] = [
    [tr('Éclosions', 'Hatches'), nf.format(hs.length), hs.some(h => h.e.active) ? tr('dont 1 en cours', '1 of them growing') : undefined],
    [tr('Œufs achetés', 'Eggs bought'), nf.format(bought.length), bought.length ? eggTypes(bought) : tr('aucun, tout est gratuit', 'none, all free')],
    [tr('Shiny obtenus', 'Shinies caught'), nf.format(cnt(hs, h => h.e.shiny)), `${num(hs.reduce((a, h) => a + h.shinyP, 0), 2)} ${tr('attendus', 'expected')}`],
    [tr('Charme Chroma', 'Shiny Charm'), charm ? tr('Oui', 'Yes') : tr('Non', 'No'), charm ? tr(`depuis l'éclosion n° ${charmFrom}`, `since hatch No. ${charmFrom}`) : undefined],
  ];
  if (loved) {
    const l = BY_ID.get(loved.e.base)!;
    tiles.push([tr('Plus beau tirage', 'Best draw'), loved.e.finalName || l.name,
      tr(`lignée ${l.name}, ${l.rank === 1 ? '1re' : l.rank + 'e'} sur ${LINES.length} chez les fans`, `${l.name} line, ranked ${l.rank} of ${LINES.length} by fans`)]);
  }
  return tiles;
}

function Curve({hs, scores}: {hs: Hatch[]; scores: number[]}) {
  const [hover, setHover] = useState<{i: number; on: boolean} | null>(null);
  const [place, setPlace] = useState<{left: number; top: number; arrow: number; above: boolean} | null>(null);
  const svg = useRef<SVGSVGElement>(null), tipBox = useRef<HTMLDivElement>(null);
  const W = 900, H = 240, L = 34, R = 64, T = 10, B = 26, GAP = 14, n = scores.length;
  const x = (i: number) => L + (W - L - R) * i / (n - 1), y = (v: number) => T + (H - T - B) * (1 - v / 100);
  const unit = 10 ** Math.max(0, Math.floor(Math.log10(n / 8)));
  const step = [1, 2, 5, 10].map(k => k * unit).find(s => n / s <= 8)!;
  const onMove = (e: MouseEvent & {currentTarget: SVGSVGElement}) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.min(n - 1, Math.max(0, Math.round(((e.clientX - box.left) * W / box.width - L) / (W - L - R) * (n - 1))));
    setHover(t => t && t.on && t.i === i ? t : {i, on: true});
  };
  useLayoutEffect(() => {
    if (!hover) return;
    const box = svg.current!.getBoundingClientRect(), {offsetWidth: tw, offsetHeight: th} = tipBox.current!;
    const px = x(hover.i) * box.width / W, py = y(scores[hover.i]) * box.height / H;
    const roomAbove = box.top + py - (document.querySelector('.ptb-nav')?.getBoundingClientRect().bottom ?? 0), roomBelow = innerHeight - box.top - py;
    const above = roomAbove >= th + GAP || roomAbove > roomBelow, left = Math.min(box.width - tw, Math.max(0, px - tw / 2));
    setPlace({left, top: above ? py - GAP - th : py + GAP, arrow: px - left, above});
  }, [hover, scores]);
  const h = hover && hs[hover.i];
  return (
    <div class="chart">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('Indice de chance après chaque éclosion', 'Luck score after each hatch')}
        onMouseMove={onMove} onMouseLeave={() => setHover(t => t && {...t, on: false})}>
        {[0, 50, 100].map(v => <>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 50 ? 'var(--ink-3)' : 'var(--line-soft)'} stroke-dasharray={v === 50 ? '4 4' : undefined} />
          <text x={L - 6} y={y(v) + 4} text-anchor="end" font-size="11" fill="var(--ink-3)">{v}</text>
        </>)}
        <text x={W - R + 6} y={y(50) + 4} font-size="11" fill="var(--ink-3)">{tr('moyenne', 'average')}</text>
        {Array.from({length: Math.floor(n / step)}, (_, i) => (i + 1) * step).map(k =>
          <text key={k} x={x(k - 1)} y={H - 8} text-anchor="middle" font-size="11" fill="var(--ink-3)">{k}</text>)}
        <path d={scores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')} fill="none" stroke="var(--s3)" stroke-width="2" stroke-linejoin="round" />
        {hover && hover.on && <circle cx={x(hover.i)} cy={y(scores[hover.i])} r="4" fill="var(--s3)" stroke="var(--surface)" stroke-width="2" />}
      </svg>
      <div ref={tipBox} class={place && !place.above ? 'tip below' : 'tip above'}
        style={hover && place ? {opacity: hover.on ? 1 : 0, left: place.left, top: place.top, '--arrow': `${place.arrow}px`} : undefined}>
        {h && <>
          <b>{tr(`Éclosion n° ${h.n}`, `Hatch No. ${h.n}`)}</b>
          <span class="tip-poke"><img alt="" src={hatchSprite(h)} />{hatchName(h)}</span>
          {tr(`Indice de chance : ${Math.round(scores[h.n - 1])}`, `Luck score: ${Math.round(scores[h.n - 1])}`)}
          {h.purchased && <span class="hint">{h.egg ? EGG_NAME[h.egg] : tr('œuf acheté', 'bought egg')}</span>}
        </>}
      </div>
    </div>
  );
}

type OnEgg = (n: number, egg: Egg | '') => void;

function BoughtEgg({h, onEgg}: {h: Hatch; onEgg: OnEgg}) {
  return (
    <div class="egg">
      {h.egg && oneIn(h.pLine)}
      {h.eggFrom === 'log' ? <span class="hint">{EGG_NAME[h.egg!]}</span>
        : <select aria-label={tr('Type de l\'œuf acheté', 'Type of the bought egg')} value={h.egg ?? ''} onChange={e => onEgg(h.n, e.currentTarget.value as Egg | '')}>
          <option value="">{tr('Œuf inconnu', 'Unknown egg')}</option>
          {possibleEggs(h.e.base).map(egg => <option key={egg} value={egg}>{EGG_NAME[egg]}</option>)}
        </select>}
    </div>
  );
}

function Luck({hs, onEgg}: {hs: Hatch[]; onEgg: OnEgg}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const named: Record<CriterionKey, Pick<Metric, 'name' | 'sub'>> = {
    uncommon: {name: tr('Peu communs', 'Uncommon')},
    rare: {name: tr('Rares', 'Rare'), sub: tr(`${DITTO_NAME} compté à part`, `${DITTO_NAME} counted separately`)},
    legendary: {name: tr('Légendaires', 'Legendary'), sub: tr('fabuleux compris', 'mythicals included')},
    shiny: {name: 'Shiny', sub: tr('toutes les éclosions', 'every hatch')},
    new: {name: tr('Lignes nouvelles', 'New lines'), sub: tr('moins de doublons = mieux', 'fewer duplicates = better')},
    ditto: {name: DITTO_NAME, sub: tr('le déguisement à 1 sur 128', 'the 1 in 128 disguise')},
    favorite: {name: tr('Coups de cœur', 'Favorites'), sub: <>{tr(`les ${FAV_TOP} lignées préférées des fans`, `the ${FAV_TOP} lines fans love most`) + ' · '}<button type="button" class="linkbtn" onClick={() => dialog.current!.showModal()}>{tr('voir la liste', 'see the list')}</button></>},
  };
  const m: Metric[] = criteria(hs).map(c => ({...c, ...named[c.key]}));
  const score = Math.round(luckScore(m));
  const mood = LANG === 'fr' ? (score >= 65 ? 'plutôt gâté' : score >= 55 ? 'un peu au-dessus de la moyenne' : score > 45 ? 'pile dans la moyenne' : score > 35 ? 'un peu en dessous' : 'plutôt malchanceux')
    : score >= 65 ? 'pretty lucky' : score >= 55 ? 'a bit above average' : score > 45 ? 'right on average' : score > 35 ? 'a bit below average' : 'rather unlucky';
  const best = [...m].sort((a, b) => b.p - a.p)[0], worst = [...m].sort((a, b) => a.p - b.p)[0];
  const tops = hs.filter(h => h.egg && h.pLine > 0).sort((a, b) => a.pLine - b.pLine).slice(0, 4);
  const had = new Set(hs.filter(h => !h.ditto).map(h => h.e.base));
  const hearts = LINES.filter(l => l.heart).sort((a, b) => a.rank - b.rank);
  const hadHearts = hearts.filter(l => had.has(l.id)).length;
  return <>
    <section class="panel hero" aria-label={tr('Indice de chance', 'Luck score')}>
      <div>
        <span class="eyebrow">{tr('Indice de chance', 'Luck score')}</span>
        <div class="big">{score}<small>/ 100</small></div>
        <p class="sentence">{tr(
          <>{`Sur ${nf.format(hs.length)} éclosions, tu es `}<b>{mood}</b>. Ton point fort : <b>{best.name}</b>{` (${pctTxt(best.p)}). Ton point faible : `}<b>{worst.name}</b>{` (${pctTxt(worst.p)}).`}</>,
          <>{`Over ${nf.format(hs.length)} hatches, you are `}<b>{mood}</b>. Your strong point: <b>{best.name}</b>{` (${pctTxt(best.p)}). Your weak point: `}<b>{worst.name}</b>{` (${pctTxt(worst.p)}).`}</>)}</p>
      </div>
      <div>
        <div class="meter" role="img" aria-label={tr(`Indice de chance ${score} sur 100`, `Luck score ${score} out of 100`)}><div class="fill" style={`width:${score}%`}></div><div class="mid"></div></div>
        <div class="meter-scale"><span>{tr('0 · malchance', '0 · unlucky')}</span><span>{tr('50 · moyenne', '50 · average')}</span><span>{tr('100 · chance', '100 · lucky')}</span></div>
      </div>
    </section>
    <section class="panel" aria-label={tr('Critères', 'Criteria')}>
      <div class="panel-head">
        <h2>{tr('Critère par critère', 'Criterion by criterion')}</h2>
        <p>{tr('Le pourcentage dit quelle part des dresseurs, avec exactement les mêmes chances que toi à chaque éclosion, aurait fait moins bien. 50 %, c\'est pile la moyenne.', 'The percentage tells what share of trainers, with exactly the same odds as you at every hatch, would have done worse. 50% is dead average.')}</p>
      </div>
      <div class="metrics">{m.map(x => <MetricRow key={x.name} x={x} />)}</div>
    </section>
    <section class="panel" aria-label={tr('Courbe de chance', 'Luck curve')}>
      <div class="panel-head">
        <h2>{tr('Ta chance au fil des éclosions', 'Your luck hatch after hatch')}</h2>
        <p>{tr('Ton indice de chance tel qu\'il était après chaque éclosion. Il bouge beaucoup au début, puis se stabilise.', 'Your luck score as it stood after each hatch. It swings early on, then settles.')}</p>
      </div>
      {hs.length < 2 ? <span class="hint">{tr('Pas encore assez d\'éclosions pour tracer ta courbe.', 'Not enough hatches yet to draw your curve.')}</span>
        : <Curve hs={hs} scores={luckAfterEach(hs)} />}
    </section>
    <section class="panel" aria-label={tr('Tirages improbables', 'Unlikely draws')}>
      <div class="panel-head">
        <h2>{tr('Tes tirages les plus improbables', 'Your most unlikely draws')}</h2>
        <p>{tr('La chance de tomber sur cette ligne précise, au moment où l\'œuf a été tiré.', 'The odds of drawing that exact line, at the moment the egg was drawn.')}</p>
      </div>
      <div class="tops">
        {tops.length ? tops.map(h => (
          <div key={h.n} class="top">
            <img alt="" loading="lazy" src={hatchSprite(h)} />
            <div style="min-width:0">
              <div class="t1">{hatchName(h)}{h.e.shiny && <> <span class="shiny">✦</span></>}</div>
              <div class="t2">{`${oneIn(h.pLine)} · ${tr('éclosion n°', 'hatch No.')} ${h.n}`}</div>
            </div>
          </div>
        )) : <span class="hint">{tr('Pas encore d\'éclosion.', 'No hatches yet.')}</span>}
      </div>
    </section>
    <section class="panel" aria-label={tr('Historique', 'History')}>
      <div class="panel-head">
        <h2>{tr('Toutes tes éclosions', 'All your hatches')}</h2>
        <p>{tr('« Chance de la ligne » = probabilité de tirer cette ligne précise. « Chance de rare » = ce que tu pouvais espérer à cette éclosion. Pour un œuf acheté dont le journal ne donne pas le type, choisis-le : il comptera alors dans tous les critères.', '“Line odds” = the probability of drawing that exact line. “Rare odds” = what you could expect at that hatch. For a bought egg whose type the log does not give, pick it: it then counts in every criterion.')}</p>
      </div>
      <div class="scroller">
        <table class="list">
          <thead><tr>
            <th class="num">{tr('N°', 'No.')}</th><th>Pokémon</th><th class="hide-sm">{tr('Rareté', 'Rarity')}</th>
            <th class="num">{tr('Chance de la ligne', 'Line odds')}</th><th class="num hide-sm">{tr('Chance de rare', 'Rare odds')}</th><th class="hide-sm">{tr('Ligne', 'Line')}</th><th class="num">Shiny</th>
          </tr></thead>
          <tbody>
            {[...hs].reverse().map(h => {
              const l = BY_ID.get(h.e.base), nm = hatchName(h);
              return (
                <tr key={h.n}>
                  <td class="num">{h.n}</td>
                  <td><div class="poke">
                    <img loading="lazy" alt="" src={hatchSprite(h)} /><span class="nm">{nm}</span>
                    {h.fav && <> <span class="fav" title={tr('Coup de cœur des fans', 'Fans\' favorite')}>♥</span></>}
                    {h.e.finalName && h.e.finalName !== nm && <> <span class="hint">{`→ ${h.e.finalName}`}</span></>}
                  </div></td>
                  <td class="hide-sm"><RarityTag rarity={h.ditto ? 'rare' : l ? l.rarity : h.e.rarity} /></td>
                  <td class="num">{h.purchased ? <BoughtEgg h={h} onEgg={onEgg} /> : oneIn(h.pLine)}</td>
                  <td class="num hide-sm">{h.egg ? pctTxt(h.pRare) : '–'}</td>
                  <td class="hide-sm">{h.e.active ? <span class="st cur">{tr('En cours', 'Growing')}</span> : h.ditto ? <span class="st">{tr('Déguisé', 'Disguised')}</span>
                    : h.isDup ? <span class="st">{tr('Doublon', 'Duplicate')}</span> : <span class="st new">{tr('Nouvelle', 'New')}</span>}</td>
                  <td class="num">{h.e.shiny && <span class="shiny">✦</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
    <dialog class="favdlg" ref={dialog} aria-labelledby="favTitle" onClick={e => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
      <div class="dlg">
        <div class="panel-head">
          <h2 id="favTitle">{tr('Les coups de cœur des fans', 'Fans\' favorites')}</h2>
          <p>{tr(<>{`Les ${FAV_TOP} lignées les plus aimées au sondage Reddit de 2019. `}<span class="fav">♥</span>{` : déjà éclose chez toi, ${hadHearts} sur ${FAV_TOP}.`}</>,
            <>{`The ${FAV_TOP} best loved lines in the 2019 Reddit survey. `}<span class="fav">♥</span>{`: already hatched by you, ${hadHearts} of ${FAV_TOP}.`}</>)}</p>
          <form method="dialog"><button class="btn">{tr('Fermer', 'Close')}</button></form>
        </div>
        <div class="favs">
          {hearts.map(l => (
            <div key={l.id} class={had.has(l.id) ? 'fv got' : 'fv'}>
              <span class="r">{l.rank}</span><img loading="lazy" alt="" src={bwSprite(l.id)} />
              <div style="min-width:0">
                <div class="t1">{l.name}{had.has(l.id) && <> <span class="fav">♥</span></>}</div>
                <div class="t2">{`${nf.format(l.votes)} ${tr('voix', 'votes')}`}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </dialog>
  </>;
}

function storedCharmFrom() {
  try { return Math.max(1, +(localStorage.getItem(CHARM_KEY) || 1) || 1); } catch { return 1; }
}
function storedEggs(): Record<number, Egg> {
  try { return JSON.parse(localStorage.getItem(EGGS_KEY) || '{}') || {}; } catch { return {}; }
}

function App() {
  const {save, live} = useSave();
  const [charmFrom, setCharmFrom] = useState(storedCharmFrom);
  const purchases = useServed<Purchase[]>('egg-purchases.json');
  const [chosen, setChosen] = useState(storedEggs);
  const charm = !!save && (save.st.inventory.shinyCharm || 0) > 0;
  const hs = useMemo(() => save && replay(save.st, charm, charmFrom, knownEggs(save.st, purchases || [], chosen)), [save, charm, charmFrom, purchases, chosen]);
  const onCharm = (e: Event) => {
    const v = Math.max(1, Math.floor(+(e.currentTarget as HTMLInputElement).value || 1));
    try { localStorage.setItem(CHARM_KEY, String(v)); } catch {}
    setCharmFrom(v);
  };
  const onEgg: OnEgg = (n, egg) => {
    const next = {...chosen};
    if (egg) next[n] = egg; else delete next[n];
    try { localStorage.setItem(EGGS_KEY, JSON.stringify(next)); } catch {}
    setChosen(next);
  };
  return (
    <div class="wrap">
      <Header eyebrow={saveEyebrow(save)} title={tr('Ta chance au tirage', 'Your hatch luck')} save={save}
        lede={tr('Chaque éclosion est rejouée avec la collection que tu avais à ce moment-là : on recalcule ce que tu pouvais espérer, puis on le compare à ce que tu as vraiment eu.', 'Every hatch is replayed with the collection you had at that moment: we work out what you could expect, then compare it with what you actually got.')} />
      <section class="panel" aria-label={tr('Ta sauvegarde', 'Your save')}>
        {hs ? <Tiles items={saveTiles(hs, charm, charmFrom)} /> : <NoSave />}
        {!live && (
          <div class="save-row">
            <a class="btn" href="index.html">{save ? tr('Changer de sauvegarde', 'Change save') : tr('Charger ma sauvegarde', 'Load my save')}</a>
            <span class="hint">{tr('La sauvegarde se charge depuis l\'accueil et sert à toutes les pages. Rien ne sort de ton navigateur.', 'The save is loaded from the home page and feeds every page. Nothing leaves your browser.')}</span>
          </div>
        )}
        {charm && (
          <label class="charm">
            <span>{tr('Charme Chroma actif à partir de l\'éclosion n°', 'Shiny Charm active from hatch No.')}</span>
            <input type="number" min="1" step="1" value={charmFrom} onInput={onCharm} />
            <span class="hint">{tr('La sauvegarde ne garde pas la date d\'achat. Si tu ne l\'as pas, mets un nombre plus grand que ton total d\'éclosions.', 'The save does not keep the purchase date. If you don\'t have it, enter a number above your total hatches.')}</span>
          </label>
        )}
      </section>
      {hs && <Luck hs={hs} onEgg={onEgg} />}
      <footer>
        {tr(<>
          <p>Règles reprises de l'app : 328 lignes de base jusqu'au #649, poids = <code>capture_rate</code>, divisé par deux quand la ligne a déjà été graduée. Métamorph : 1 chance sur 128 sur un commun qui évolue. Shiny : 1/64, 1/48 avec le Charme Chroma. Le percentile est calculé exactement (loi de Poisson-binomiale), avec demi-poids sur l'égalité. Seule approximation : les chances par ligne, doublon et coup de cœur négligent le déguisement de Métamorph, qui retire au plus 1/128 (0,8 %) à un commun qui évolue.</p>
          <p>Les éclosions qui suivent un Pokémon relâché viennent d'un œuf acheté. La sauvegarde n'en garde pas le type : il vient du journal de l'app, que lit le serveur, sinon de ton choix dans l'historique. Un Œuf Pokémon compte comme un œuf gratuit ; un Œuf peu commun ou un Œuf rare tire avec les mêmes poids parmi les lignes de <code>capture_rate</code> 120 ou 45 au plus. Un œuf acheté de type inconnu ne compte que pour le shiny. L'indice de chance est la moyenne des sept percentiles, c'est un résumé ludique, pas une mesure statistique. Sprites : PokeAPI/sprites.</p>
          <p>Coups de cœur : chaque lignée additionne les voix de ses Pokémon, sur une seule branche pour Évoli et les autres évolutions multiples, au <a href="https://github.com/arturomoncadatorres/favorite-pokemon">sondage Reddit de 2019</a> (52 000 votants, un favori chacun, données sous licence MIT). Les 75 lignées les mieux placées sont les coups de cœur, marquées ♥ dans l'historique.</p>
        </>, <>
          <p>Rules taken from the app: 328 base lines up to #649, weight = <code>capture_rate</code>, halved once the line has graduated. Ditto: 1 in 128 on a common that evolves. Shiny: 1/64, 1/48 with the Shiny Charm. The percentile is computed exactly (Poisson binomial distribution), with half weight on ties. Only approximation: line, duplicate and favorite odds ignore Ditto's disguise, which takes at most 1/128 (0.8%) off a common that evolves.</p>
          <p>Hatches that follow a released Pokémon come from a bought egg. The save does not keep its type: it comes from the app's log, which the server reads, or else from your choice in the history. A Pokémon Egg counts like a free egg; an Uncommon Egg or a Rare Egg draws with the same weights among the lines with a <code>capture_rate</code> of 120 or 45 at most. A bought egg of unknown type only counts for shiny. The luck score is the average of the seven percentiles, a playful summary, not a statistical measure. Sprites: PokeAPI/sprites.</p>
          <p>Favorites: each line adds up the votes of its Pokémon, along a single branch for Eevee and other split evolutions, in the <a href="https://github.com/arturomoncadatorres/favorite-pokemon">2019 Reddit survey</a> (52,000 voters, one favorite each, data under the MIT license). The 75 best placed lines are the favorites, marked ♥ in the history.</p>
        </>)}
      </footer>
    </div>
  );
}

mount(tr('Ta chance au tirage', 'Your hatch luck'), App);
