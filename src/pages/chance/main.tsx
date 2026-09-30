import './page.css';
import type {ComponentChildren} from 'preact';
import {useMemo, useRef, useState} from 'preact/hooks';
import {Header, NoSave, Tiles, mount, saveEyebrow, type TileData} from '../../components/Page';
import {RarityTag} from '../../components/Rarity';
import {LINE_ROWS} from '../../data/lines';
import {NAMES} from '../../data/species';
import {useSave} from '../../lib/hooks';
import {LANG, LOCALE, tr} from '../../lib/i18n';
import type {Rarity, State} from '../../lib/save';
import {bwSprite, spriteID, withForm} from '../../lib/sprites';

interface Line { id: number; name: string; cr: number; leg: boolean; evo: boolean; rarity: Rarity; votes: number; rank: number; heart: boolean }
/* Fans' favourites: a line gathers the votes of its members along one evolution path (Charmander, Charmeleon and
   Charizard add up; Eevee only adds its best loved evolution, since a hatch grows into a single one). Votes come from
   the 2019 Reddit survey, one favourite per voter. The 75 best loved lines are the "coups de cœur", about one hatch in five. */
const FAV_TOP = 75;
const LINES: Line[] = LINE_ROWS.map(([id, cr, leg, evo, votes]) => ({id, name: NAMES[id - 1], cr, leg: !!leg, evo: !!evo,
  rarity: leg ? 'legendary' : cr <= 45 ? 'rare' : cr <= 120 ? 'uncommon' : 'common', votes, rank: 0, heart: false}));
[...LINES].sort((a, b) => b.votes - a.votes).forEach((l, i) => { l.rank = i + 1; l.heart = i < FAV_TOP; });
const BY_ID = new Map(LINES.map(l => [l.id, l]));
const DITTO = 132, DITTO_NAME = NAMES[DITTO - 1];
const CHARM_KEY = 'poketokenbar-charm-from-v1';
const nf = new Intl.NumberFormat(LOCALE);
const num = (v: number, d = 1) => v.toLocaleString(LOCALE, {maximumFractionDigits: d});
const oneIn = (p: number) => p > 0 ? tr('1 sur ', '1 in ') + nf.format(Math.round(1 / p)) : '–';
const pctTxt = (p: number) => Math.round(p * 100) + tr(' %', '%');

// Exact distribution of a sum of independent Bernoulli(p_i).
function poissonBinomial(ps: number[]) {
  let dist = [1];
  for (const p of ps) {
    const next = new Array<number>(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k++) { next[k] += dist[k] * (1 - p); next[k + 1] += dist[k] * p; }
    dist = next;
  }
  return dist;
}
// Share of equally placed players who did worse (mid-p on ties).
function luck(ps: number[], obs: number, higherIsBetter = true) {
  const d = poissonBinomial(ps);
  let below = 0, above = 0;
  d.forEach((q, k) => { if (k < obs) below += q; else if (k > obs) above += q; });
  const eq = d[obs] || 0;
  return (higherIsBetter ? below : above) + eq / 2;
}

interface Entry { base: number; rarity: Rarity; shiny: boolean; released?: boolean; finalName?: string; form?: string | null; active: boolean }
interface Hatch {
  n: number; e: Entry; ditto: boolean; purchased: boolean; pLine: number; pLeg: number; pUnc: number; pRare: number; pDup: number; pFav: number; pDitto: number;
  shinyP: number; isDup: boolean; rare: boolean; leg: boolean; unc: boolean; fav: boolean;
}
function replay(st: State, charm: boolean, charmFrom: number) {
  const collected = new Set<number>();
  const hatches: Hatch[] = [];
  const entries: Entry[] = st.dex.map(d => ({base: d.baseID, rarity: d.rarity, shiny: d.isShiny, released: !!d.releasedAt, finalName: NAMES[d.finalID - 1], form: d.unownForm, active: false}));
  if (st.active) entries.push({base: st.active.baseID, rarity: st.active.rarity, shiny: st.active.isShiny, active: true});
  let prevReleased = false;
  entries.forEach((e, i) => {
    let total = 0, wLeg = 0, wRare = 0, wUnc = 0, wDup = 0, wEvoCommon = 0, wFav = 0;
    const w = (l: Line) => collected.has(l.id) ? Math.max(1, Math.floor(l.cr / 2)) : l.cr;
    for (const l of LINES) {
      const x = w(l); total += x;
      if (l.leg) wLeg += x; else if (l.rarity === 'rare') wRare += x; else if (l.rarity === 'uncommon') wUnc += x;
      if (collected.has(l.id)) wDup += x;
      if (l.heart) wFav += x;
      if (l.rarity === 'common' && l.evo) wEvoCommon += x;
    }
    const pDitto = wEvoCommon / total / 128;
    const ditto = e.base === DITTO;
    const line = BY_ID.get(e.base);
    hatches.push({
      n: i + 1, e, ditto, purchased: prevReleased,
      pLine: ditto ? pDitto : line ? w(line) / total : 0,
      pLeg: wLeg / total, pUnc: wUnc / total, pRare: wRare / total, pDup: wDup / total, pFav: wFav / total, pDitto,
      shinyP: charm && i + 1 >= charmFrom ? 1 / 48 : 1 / 64,
      isDup: !ditto && collected.has(e.base),
      rare: !ditto && !!(line && line.rarity === 'rare'),
      leg: !!(line && line.leg),
      unc: !ditto && !!(line && line.rarity === 'uncommon'),
      fav: !ditto && !!(line && line.heart),
    });
    if (!e.active && !e.released) collected.add(e.base);
    prevReleased = !!e.released;
  });
  return hatches;
}
const hatchName = (h: Hatch) => { const l = BY_ID.get(h.e.base); return h.ditto ? DITTO_NAME : l ? withForm(l.name, h.e.base, h.e.form) : '#' + h.e.base; };
const hatchSprite = (h: Hatch) => bwSprite(h.ditto ? DITTO : spriteID(h.e.base, h.e.form));

interface Metric { name: string; sub?: ComponentChildren; ps: number[]; obs: number; paid?: number; up: boolean; dup?: boolean; exp: number; p: number }
const verdict = (p: number) => p >= .8 ? tr('très chanceux', 'very lucky') : p >= .6 ? tr('chanceux', 'lucky') : p > .4 ? tr('dans la moyenne', 'average') : p > .2 ? tr('malchanceux', 'unlucky') : tr('très malchanceux', 'very unlucky');

function MetricRow({x}: {x: Metric}) {
  const all = x.obs + (x.paid || 0);
  const obs = LANG === 'fr' ? (x.dup
    ? <><b>{nf.format(all)}</b>{` doublon${all > 1 ? 's' : ''} · ${num(x.exp)} attendus`}</>
    : <><b>{nf.format(all)}</b>{` obtenu${all > 1 ? 's' : ''} · ${num(x.exp, x.exp < 1 ? 2 : 1)} attendu${x.exp >= 2 ? 's' : ''}`}</>)
    : x.dup ? <><b>{nf.format(all)}</b>{` duplicate${all > 1 ? 's' : ''} · ${num(x.exp)} expected`}</>
    : <><b>{nf.format(all)}</b>{` caught · ${num(x.exp, x.exp < 1 ? 2 : 1)} expected`}</>;
  return (
    <div class="metric">
      <div class="name">{x.name}{x.sub && <span>{x.sub}</span>}</div>
      <div class="obs">{obs}{!!x.paid && <span>{tr(`dont ${nf.format(x.paid)} d'${x.paid > 1 ? 'œufs achetés' : 'un œuf acheté'}, hors calcul`, `${nf.format(x.paid)} of them from ${x.paid > 1 ? 'bought eggs' : 'a bought egg'}, not counted`)}</span>}</div>
      <div>
        <div class="meter" role="img" aria-label={`${x.name}${tr(' : ', ': ')}${pctTxt(x.p)}`}><div class="fill" style={`width:${x.p * 100}%`}></div><div class="mid"></div></div>
        <span class="verdict">{verdict(x.p)}</span>
      </div>
      <div class="pct">{pctTxt(x.p)}</div>
    </div>
  );
}

const cnt = (arr: Hatch[], f: (h: Hatch) => boolean) => arr.filter(f).length;

function saveTiles(hs: Hatch[], charm: boolean, charmFrom: number) {
  const bought = cnt(hs, h => h.purchased);
  const loved = hs.filter(h => !h.ditto && BY_ID.has(h.e.base)).sort((a, b) => BY_ID.get(a.e.base)!.rank - BY_ID.get(b.e.base)!.rank)[0];
  const tiles: TileData[] = [
    [tr('Éclosions', 'Hatches'), nf.format(hs.length), hs.some(h => h.e.active) ? tr('dont 1 en cours', '1 of them growing') : undefined],
    [tr('Œufs achetés', 'Eggs bought'), nf.format(bought), bought ? tr('exclus sauf pour le shiny', 'left out except for shiny') : tr('aucun, tout est gratuit', 'none, all free')],
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

function Luck({hs}: {hs: Hatch[]}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const free = hs.filter(h => !h.purchased), paid = hs.filter(h => h.purchased);
  const m: Metric[] = ([
    {name: tr('Peu communs', 'Uncommon'), ps: free.map(h => h.pUnc), obs: cnt(free, h => h.unc), paid: cnt(paid, h => h.unc), up: true},
    {name: tr('Rares', 'Rare'), sub: tr(`${DITTO_NAME} compté à part`, `${DITTO_NAME} counted separately`), ps: free.map(h => h.pRare), obs: cnt(free, h => h.rare), paid: cnt(paid, h => h.rare), up: true},
    {name: tr('Légendaires', 'Legendary'), sub: tr('fabuleux compris', 'mythicals included'), ps: free.map(h => h.pLeg), obs: cnt(free, h => h.leg), paid: cnt(paid, h => h.leg), up: true},
    {name: 'Shiny', sub: tr('toutes les éclosions', 'every hatch'), ps: hs.map(h => h.shinyP), obs: cnt(hs, h => h.e.shiny), up: true},
    {name: tr('Lignes nouvelles', 'New lines'), sub: tr('moins de doublons = mieux', 'fewer duplicates = better'),
      ps: free.filter(h => !h.ditto).map(h => h.pDup), obs: cnt(free, h => h.isDup), paid: cnt(paid, h => h.isDup), up: false, dup: true},
    {name: DITTO_NAME, sub: tr('le déguisement à 1 sur 128', 'the 1 in 128 disguise'), ps: free.map(h => h.pDitto), obs: cnt(free, h => h.ditto), paid: cnt(paid, h => h.ditto), up: true},
    {name: tr('Coups de cœur', 'Favorites'), sub: <>{tr(`les ${FAV_TOP} lignées préférées des fans`, `the ${FAV_TOP} lines fans love most`) + ' · '}<button type="button" class="linkbtn" onClick={() => dialog.current!.showModal()}>{tr('voir la liste', 'see the list')}</button></>,
      ps: free.map(h => h.pFav), obs: cnt(free, h => h.fav), paid: cnt(paid, h => h.fav), up: true},
  ] as Omit<Metric, 'exp' | 'p'>[]).map(x => ({...x, exp: x.ps.reduce((a, b) => a + b, 0), p: luck(x.ps, x.obs, x.up)}));
  const score = Math.round(m.reduce((a, x) => a + x.p, 0) / m.length * 100);
  const mood = LANG === 'fr' ? (score >= 65 ? 'plutôt gâté' : score >= 55 ? 'un peu au-dessus de la moyenne' : score > 45 ? 'pile dans la moyenne' : score > 35 ? 'un peu en dessous' : 'plutôt malchanceux')
    : score >= 65 ? 'pretty lucky' : score >= 55 ? 'a bit above average' : score > 45 ? 'right on average' : score > 35 ? 'a bit below average' : 'rather unlucky';
  const best = [...m].sort((a, b) => b.p - a.p)[0], worst = [...m].sort((a, b) => a.p - b.p)[0];
  const tops = free.filter(h => h.pLine > 0).sort((a, b) => a.pLine - b.pLine).slice(0, 4);
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
      <div class="metrics">{m.map(x => <MetricRow x={x} />)}</div>
    </section>
    <section class="panel" aria-label={tr('Tirages improbables', 'Unlikely draws')}>
      <div class="panel-head">
        <h2>{tr('Tes tirages les plus improbables', 'Your most unlikely draws')}</h2>
        <p>{tr('La chance de tomber sur cette ligne précise, au moment où l\'œuf a été tiré.', 'The odds of drawing that exact line, at the moment the egg was drawn.')}</p>
      </div>
      <div class="tops">
        {tops.length ? tops.map(h => (
          <div class="top">
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
        <p>{tr('« Chance de la ligne » = probabilité de tirer cette ligne précise. « Chance de rare » = ce que tu pouvais espérer à cette éclosion.', '“Line odds” = the probability of drawing that exact line. “Rare odds” = what you could expect at that hatch.')}</p>
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
                <tr>
                  <td class="num">{h.n}</td>
                  <td><div class="poke">
                    <img loading="lazy" alt="" src={hatchSprite(h)} /><span class="nm">{nm}</span>
                    {h.fav && <> <span class="fav" title={tr('Coup de cœur des fans', 'Fans\' favorite')}>♥</span></>}
                    {h.e.finalName && h.e.finalName !== nm && <> <span class="hint">{`→ ${h.e.finalName}`}</span></>}
                  </div></td>
                  <td class="hide-sm"><RarityTag rarity={h.ditto ? 'rare' : l ? l.rarity : h.e.rarity} /></td>
                  <td class="num">{h.purchased ? <span class="hint">{tr('œuf acheté', 'bought egg')}</span> : oneIn(h.pLine)}</td>
                  <td class="num hide-sm">{h.purchased ? '–' : pctTxt(h.pRare)}</td>
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
            <div class={had.has(l.id) ? 'fv got' : 'fv'}>
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

function App() {
  const {save, live} = useSave();
  const [charmFrom, setCharmFrom] = useState(storedCharmFrom);
  const charm = !!save && (save.st.inventory.shinyCharm || 0) > 0;
  const hs = useMemo(() => save && replay(save.st, charm, charmFrom), [save, charm, charmFrom]);
  const onCharm = (e: Event) => {
    const v = Math.max(1, Math.floor(+(e.currentTarget as HTMLInputElement).value || 1));
    try { localStorage.setItem(CHARM_KEY, String(v)); } catch {}
    setCharmFrom(v);
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
      {hs && <Luck hs={hs} />}
      <footer>
        {tr(<>
          <p>Règles reprises de l'app : 328 lignes de base jusqu'au #649, poids = <code>capture_rate</code>, divisé par deux quand la ligne a déjà été graduée. Métamorph : 1 chance sur 128 sur un commun qui évolue. Shiny : 1/64, 1/48 avec le Charme Chroma. Le percentile est calculé exactement (loi de Poisson-binomiale), avec demi-poids sur l'égalité.</p>
          <p>Les éclosions qui suivent un Pokémon relâché viennent d'un œuf acheté dont la sauvegarde ne garde pas le type : elles ne comptent que pour le shiny. L'indice de chance est la moyenne des sept percentiles, c'est un résumé ludique, pas une mesure statistique. Sprites : PokeAPI/sprites.</p>
          <p>Coups de cœur : chaque lignée additionne les voix de ses Pokémon, sur une seule branche pour Évoli et les autres évolutions multiples, au <a href="https://github.com/arturomoncadatorres/favorite-pokemon">sondage Reddit de 2019</a> (52 000 votants, un favori chacun, données sous licence MIT). Les 75 lignées les mieux placées sont les coups de cœur, marquées ♥ dans l'historique.</p>
        </>, <>
          <p>Rules taken from the app: 328 base lines up to #649, weight = <code>capture_rate</code>, halved once the line has graduated. Ditto: 1 in 128 on a common that evolves. Shiny: 1/64, 1/48 with the Shiny Charm. The percentile is computed exactly (Poisson binomial distribution), with half weight on ties.</p>
          <p>Hatches that follow a released Pokémon come from a bought egg whose type the save does not keep: they only count for shiny. The luck score is the average of the seven percentiles, a playful summary, not a statistical measure. Sprites: PokeAPI/sprites.</p>
          <p>Favorites: each line adds up the votes of its Pokémon, along a single branch for Eevee and other split evolutions, in the <a href="https://github.com/arturomoncadatorres/favorite-pokemon">2019 Reddit survey</a> (52,000 voters, one favorite each, data under the MIT license). The 75 best placed lines are the favorites, marked ♥ in the history.</p>
        </>)}
      </footer>
    </div>
  );
}

mount(tr('Ta chance au tirage', 'Your hatch luck'), App);
