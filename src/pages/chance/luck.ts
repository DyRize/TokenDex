// Every hatch replayed with the collection the player had at that moment, and how lucky the draws were.
import {LINE_ROWS} from '../../data/lines';
import {NAMES} from '../../data/species';
import type {Rarity, State} from '../../lib/save';
import {CEIL, type Egg} from '../prochains/draw';

interface Line { id: number; name: string; cr: number; leg: boolean; evo: boolean; rarity: Rarity; votes: number; rank: number; heart: boolean }
/* Fans' favourites: a line gathers the votes of its members along one evolution path (Charmander, Charmeleon and
   Charizard add up; Eevee only adds its best loved evolution, since a hatch grows into a single one). Votes come from
   the 2019 Reddit survey, one favourite per voter. The 75 best loved lines are the "coups de cœur", about one hatch in five. */
export const FAV_TOP = 75;
export const LINES: Line[] = LINE_ROWS.map(([id, cr, leg, evo, votes]) => ({id, name: NAMES[id - 1], cr, leg: !!leg, evo: !!evo,
  rarity: leg ? 'legendary' : cr <= 45 ? 'rare' : cr <= 120 ? 'uncommon' : 'common', votes, rank: 0, heart: false}));
[...LINES].sort((a, b) => b.votes - a.votes).forEach((l, i) => { l.rank = i + 1; l.heart = i < FAV_TOP; });
export const BY_ID = new Map(LINES.map(l => [l.id, l]));
export const DITTO = 132;
const EGGS: Egg[] = ['none', 'uncommon', 'rare'];
/** The eggs whose draw holds this line. Ditto only hatches disguised as a common. */
export const possibleEggs = (base: number) => base === DITTO ? ['none' as const] : EGGS.filter(egg => (BY_ID.get(base)?.cr ?? CEIL.none) <= CEIL[egg]);

// Exact distribution of a sum of independent Bernoulli(p_i).
function addTrial(dist: number[], p: number) {
  const next = new Array<number>(dist.length + 1).fill(0);
  for (let k = 0; k < dist.length; k++) { next[k] += dist[k] * (1 - p); next[k + 1] += dist[k] * p; }
  return next;
}
// Share of equally placed players who did worse (mid-p on ties).
function luck(d: number[], obs: number, higherIsBetter: boolean) {
  let below = 0, above = 0;
  d.forEach((q, k) => { if (k < obs) below += q; else if (k > obs) above += q; });
  const eq = d[obs] || 0;
  return (higherIsBetter ? below : above) + eq / 2;
}

interface Entry { base: number; rarity: Rarity; shiny: boolean; released?: boolean; finalName?: string; form?: string | null; active: boolean }
export type EggSource = 'log' | 'player';
/** The type of each bought egg the log or the player gives, by hatch number. */
export type KnownEggs = Map<number, {egg: Egg; from: EggSource}>;
export type OddsRange = {low: number; high: number};
export interface Hatch {
  n: number; e: Entry; ditto: boolean; purchased: boolean;
  /** The egg drawn: 'none' for a free egg, null for a bought egg of unknown type. */
  egg: Egg | null; eggFrom: EggSource | 'unknown' | null; pLine: number; pLeg: number; pUnc: number; pRare: number; pDup: number; pFav: number; pDitto: number;
  pCommon: number; pRarity: OddsRange; pNovelty: OddsRange;
  shinyP: number; isDup: boolean; rare: boolean; leg: boolean; unc: boolean; fav: boolean;
}
const RARITY_ODDS = {common: 'pCommon', uncommon: 'pUnc', rare: 'pRare', legendary: 'pLeg'} as const;
export function replay(st: State, charm: boolean, charmFrom: number, known: KnownEggs = new Map()) {
  const collected = new Set<number>();
  const hatches: Hatch[] = [];
  const entries: Entry[] = st.dex.map(d => ({base: d.baseID, rarity: d.rarity, shiny: d.isShiny, released: !!d.releasedAt, finalName: NAMES[d.finalID - 1], form: d.unownForm, active: false}));
  if (st.active) entries.push({base: st.active.baseID, rarity: st.active.rarity, shiny: st.active.isShiny, active: true});
  const w = (l: Line) => collected.has(l.id) ? Math.max(1, Math.floor(l.cr / 2)) : l.cr;
  const draw = (egg: Egg) => {
    let total = 0, wLeg = 0, wRare = 0, wUnc = 0, wDup = 0, wEvoCommon = 0, wFav = 0;
    for (const l of LINES) {
      if (l.cr > CEIL[egg]) continue;
      const x = w(l); total += x;
      if (l.leg) wLeg += x; else if (l.rarity === 'rare') wRare += x; else if (l.rarity === 'uncommon') wUnc += x;
      if (collected.has(l.id)) wDup += x;
      if (l.heart) wFav += x;
      if (l.rarity === 'common' && l.evo) wEvoCommon += x;
    }
    const pDitto = wEvoCommon / total / 128;
    return {total, pLeg: wLeg / total, pUnc: wUnc / total, pRare: wRare / total, pDup: wDup / total, pFav: wFav / total, pDitto,
      pCommon: (total - wLeg - wRare - wUnc) / total - pDitto};
  };
  let prevReleased = false;
  entries.forEach((e, i) => {
    const bought = prevReleased ? known.get(i + 1) : undefined, egg = prevReleased ? bought?.egg ?? null : 'none', ceil = CEIL[egg ?? 'none'];
    const {total, ...odds} = draw(egg ?? 'none');
    const ditto = e.base === DITTO;
    const line = BY_ID.get(e.base);
    const outcome = ditto ? 'pDitto' : RARITY_ODDS[line?.rarity ?? e.rarity], isDup = !ditto && collected.has(e.base);
    const draws = egg ? [odds] : possibleEggs(e.base).map(draw);
    const range = (f: (o: typeof odds) => number) => { const ps = draws.map(f); return {low: Math.min(...ps), high: Math.max(...ps)}; };
    hatches.push({
      n: i + 1, e, ditto, purchased: prevReleased, egg, eggFrom: prevReleased ? bought?.from ?? 'unknown' : null,
      pLine: ditto ? odds.pDitto : line && line.cr <= ceil ? w(line) / total : 0,
      ...odds, pRarity: range(o => o[outcome]), pNovelty: range(o => isDup ? o.pDup : 1 - o.pDup),
      shinyP: charm && i + 1 >= charmFrom ? 1 / 48 : 1 / 64,
      isDup,
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

const DAY = 864e5, WEEK = 7 * DAY, YEAR = 365.25 * DAY, MONTH = YEAR / 12;
export function hatchPace(st: State, at: number) {
  const dated = st.dex.flatMap(d => d.caughtAt === null ? [] : [d.caughtAt]);
  if (dated.length < 2 || dated.at(-1)! - dated[0] < DAY) return null;
  return dated.length / ((at - dated[0]) / WEEK);
}

type WaitUnit = 'day' | 'week' | 'month' | 'year';
export type Wait = {n: number; unit: WaitUnit};
export function averageWait(p: number, pace: number): Wait {
  const t = 1 / p / pace * WEEK;
  const [unit, size]: [WaitUnit, number] = Math.round(t / DAY) < 14 ? ['day', DAY] : t < 3 * MONTH ? ['week', WEEK] : Math.round(t / MONTH) < 24 ? ['month', MONTH] : ['year', YEAR];
  return {n: Math.max(1, Math.round(t / size)), unit};
}

export type CriterionKey = 'uncommon' | 'rare' | 'legendary' | 'shiny' | 'new' | 'ditto' | 'favorite';
// A bought egg of unknown type only counts for shiny: its draw is unknown.
const known = (h: Hatch) => h.egg !== null;
const CRITERIA: {key: CriterionKey; counts: (h: Hatch) => boolean; odds: (h: Hatch) => number; hit: (h: Hatch) => boolean; up: boolean}[] = [
  {key: 'uncommon', counts: known, odds: h => h.pUnc, hit: h => h.unc, up: true},
  {key: 'rare', counts: known, odds: h => h.pRare, hit: h => h.rare, up: true},
  {key: 'legendary', counts: known, odds: h => h.pLeg, hit: h => h.leg, up: true},
  {key: 'shiny', counts: () => true, odds: h => h.shinyP, hit: h => h.e.shiny, up: true},
  {key: 'new', counts: h => known(h) && !h.ditto, odds: h => h.pDup, hit: h => h.isDup, up: false},
  {key: 'ditto', counts: known, odds: h => h.pDitto, hit: h => h.ditto, up: true},
  {key: 'favorite', counts: known, odds: h => h.pFav, hit: h => h.fav, up: true},
];

export interface Criterion { key: CriterionKey; obs: number; paid: number; exp: number; p: number }
export function criteria(hs: Hatch[]): Criterion[] {
  return CRITERIA.map(c => {
    const ps = hs.filter(c.counts).map(c.odds), obs = hs.filter(h => c.counts(h) && c.hit(h)).length;
    return {key: c.key, obs, paid: hs.filter(h => !c.counts(h) && c.hit(h)).length, exp: ps.reduce((a, b) => a + b, 0), p: luck(ps.reduce(addTrial, [1]), obs, c.up)};
  });
}

export const luckScore = (cs: {p: number}[]) => cs.reduce((a, x) => a + x.p, 0) / cs.length * 100;

export function luckAfterEach(hs: Hatch[]) {
  const runs = CRITERIA.map(c => ({c, dist: [1], obs: 0}));
  return hs.map(h => {
    for (const r of runs) if (r.c.counts(h)) { r.dist = addTrial(r.dist, r.c.odds(h)); if (r.c.hit(h)) r.obs++; }
    return luckScore(runs.map(r => ({p: luck(r.dist, r.obs, r.c.up)})));
  });
}

export const luckEffects = (scores: number[]) => scores.map((s, i) => s - (i ? scores[i - 1] : 50));
