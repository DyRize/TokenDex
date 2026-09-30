// Strategy simulator for the Pokédex chrono. Pure function of the params; no DOM, it runs in sim.worker.ts.
import {LINE_ROWS} from '../../data/lines';
import {CANDY_XP, EGG_COST, GRAD, PRICE} from '../../lib/balance';
import type {Rarity} from '../../lib/save';
import {TREES, type Tree} from './model';

const DITTO = 132, TARGET = 649;

/** A save: species held, collected [base, final] pairs, shop balance, Rare Candies, and the Pokémon growing now. */
export interface SimInit {
  dex: number[]; finals: number[][]; wallet: number; candies: number;
  active: {left: number; path: number[]; base: number} | null;
}
export interface SimParams { g: number; s: number; rate: number; freeWeek: number; init: SimInit | null }
/** Median tokens / hatches / candies / eggs to reach each dex count, indexed by that count. */
export interface StratResult { tokens: Float64Array; hatches: Float64Array; candies: Float64Array; eggs: Float64Array }

const kids = (t: Tree) => t.slice(1) as Tree[];
function finalsOf(t: Tree) {
  const f: number[] = [];
  (function walk(m: Tree) { if (m.length === 1) f.push(m[0]); else kids(m).forEach(walk); })(t);
  return f;
}
const lines = LINE_ROWS.map(([id, cr, leg], idx) => {
  const tree = TREES[id];
  return {idx, id, cr, tree, finals: finalsOf(tree), rarity: (leg ? 'legendary' : cr <= 45 ? 'rare' : cr <= 120 ? 'uncommon' : 'common') as Rarity};
});
type Line = typeof lines[number];
const rareIdx = lines.filter(l => l.cr <= 45).map(l => l.idx);
const lateIdx = lines.filter(l => l.cr > 45).map(l => l.idx);

function fenwick(n: number) {
  const t = new Float64Array(n + 1);
  return {
    add(i: number, d: number) { for (i++; i <= n; i += i & -i) t[i] += d; },
    find(x: number) { // smallest i with prefix(i) > x
      let pos = 0, step = 1 << Math.floor(Math.log2(n));
      for (; step; step >>= 1) if (pos + step <= n && t[pos + step] <= x) { pos += step; x -= t[pos]; }
      return pos;
    },
  };
}

function mulberry32(a: number) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// strategy: 0 no shop, 1 candies, 2 candies + Rare+ on useless hatch, 3 same but only once every non-rare line is complete
function run(strategy: number, {g, s, rate, freeWeek, init}: SimParams, seed: number) {
  const rnd = mulberry32(seed);
  const n = lines.length, greedy = strategy > 0;
  const w = lines.map(l => l.cr);
  const full = fenwick(n), rare = fenwick(rareIdx.length);
  const rarePos = new Int32Array(n).fill(-1);
  rareIdx.forEach((i, k) => { rarePos[i] = k; rare.add(k, w[i]); });
  lines.forEach((_, i) => full.add(i, w[i]));
  let fullTotal = w.reduce((a, b) => a + b, 0), rareTotal = rareIdx.reduce((a, i) => a + w[i], 0);
  const got = lines.map(() => new Set<number>());
  const dex = new Uint8Array(TARGET + 1);
  let dexCount = 0, T = 0, W = 0, C = 0, credit = 0, hatches = 0, candies = 0, eggs = 0, lateLeft = lateIdx.length;
  const lateDone = new Uint8Array(n);
  const tokensAt = new Float64Array(TARGET + 1), hatchAt = new Float64Array(TARGET + 1),
    candyAt = new Float64Array(TARGET + 1), eggAt = new Float64Array(TARGET + 1);
  const price = PRICE.candy * s, eggPrice = PRICE.rareEgg * s;
  const freePerToken = freeWeek > 0 ? freeWeek / (7 * rate * 1e6) : 0;
  const useCandies = strategy > 0 || freeWeek > 0, buys = strategy > 0;

  const addDex = (sp: number) => {
    if (sp > TARGET || dex[sp]) return;
    dex[sp] = 1; dexCount++;
    tokensAt[dexCount] = T; hatchAt[dexCount] = hatches; candyAt[dexCount] = candies; eggAt[dexCount] = eggs;
  };
  const advance = (dt: number) => {
    T += dt; W += dt;
    if (freePerToken) { credit += dt * freePerToken; if (credit >= 1) { const k = Math.floor(credit); C += k; credit -= k; } }
  };
  const saving = () => strategy === 2 || (strategy === 3 && lateLeft === 0);
  const buyCandies = () => {
    if (!buys) return;
    const reserve = saving() ? eggPrice : 0;
    if (W - reserve >= price) { const k = Math.floor((W - reserve) / price); W -= k * price; C += k; }
  };
  const grow = (total: number) => {
    let rem = total;
    while (rem > 1e-6) {
      buyCandies();
      if (useCandies && C >= 1 && (greedy || rem >= CANDY_XP)) { C--; candies++; rem -= CANDY_XP; continue; }
      let dt = rem;
      if (useCandies && (greedy || rem >= CANDY_XP)) {
        const reserve = saving() ? eggPrice : 0;
        if (buys) dt = Math.min(dt, Math.max(1, reserve + price - W));
        if (freePerToken) dt = Math.min(dt, Math.max(1, (1 - credit) / freePerToken));
      }
      advance(dt); rem -= dt;
    }
  };
  const finalsCache = new Map<Tree, number[]>();
  const finalsAt = (node: Tree) => {
    let f = finalsCache.get(node);
    if (!f) { f = finalsOf(node); finalsCache.set(node, f); }
    return f;
  };
  const pickPath = (l: Line) => {
    const path: number[] = [];
    let node = l.tree;
    for (;;) {
      path.push(node[0]);
      if (node.length === 1) return path;
      const ks = kids(node);
      const fresh = ks.filter(k => finalsAt(k).some(f => !got[l.idx].has(f)));
      const pool = fresh.length ? fresh : ks;
      node = pool[Math.floor(rnd() * pool.length)];
    }
  };
  const complete = (l: Line) => got[l.idx].size === l.finals.length;
  const collect = (i: number, final: number) => {
    if (got[i].has(final)) return;
    if (got[i].size === 0) {
      const half = Math.max(1, Math.floor(lines[i].cr / 2)), d = half - w[i];
      w[i] = half; full.add(i, d); fullTotal += d;
      if (rarePos[i] >= 0) { rare.add(rarePos[i], d); rareTotal += d; }
    }
    got[i].add(final);
    if (lines[i].cr > 45 && !lateDone[i] && complete(lines[i])) { lateDone[i] = 1; lateLeft--; }
  };

  // A save: what is already caught costs nothing, the Pokémon growing now finishes first.
  if (init) {
    const idxOf = new Map(lines.map(l => [l.id, l.idx]));
    init.dex.forEach(addDex);
    init.finals.forEach(([b, f]) => { const i = idxOf.get(b); if (i !== undefined) collect(i, f); });
    W = init.wallet; C = init.candies;
    if (init.active) {
      grow(init.active.left);
      init.active.path.forEach(addDex);
      const i = idxOf.get(init.active.base);
      if (i !== undefined) collect(i, init.active.path[init.active.path.length - 1]);
    }
  }

  let tier: 'rare' | null = null, guard = 0;
  while (dexCount < TARGET && guard++ < 400000) {
    advance(EGG_COST * g);
    hatches++;
    let i;
    if (tier === 'rare') { const k = rare.find(rnd() * rareTotal); i = rareIdx[k]; }
    else i = full.find(rnd() * fullTotal);
    tier = null;
    const l = lines[i];
    const path = pickPath(l);
    const ditto = l.rarity === 'common' && path.length >= 2 && rnd() < 1 / 128;
    if (!ditto) addDex(path[0]);
    if (ditto) {
      const useless = dex[DITTO] === 1;
      if (strategy >= 2 && useless && saving() && W >= eggPrice) { W -= eggPrice; eggs++; tier = 'rare'; continue; }
      grow(GRAD.rare * g / (dex[DITTO] ? 2 : 1));
      addDex(DITTO);
      continue;
    }
    if (strategy >= 2 && complete(l) && saving() && W >= eggPrice) { W -= eggPrice; eggs++; tier = 'rare'; continue; }
    const boost = got[i].size > 0 ? 2 : 1;
    grow(GRAD[l.rarity] * g / boost);
    path.forEach(addDex);
    collect(i, path[path.length - 1]);
  }
  return {tokensAt, hatchAt, candyAt, eggAt};
}

function median(xs: number[]) { const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }

/** Per strategy, the median over `runs` games of what it takes to reach each dex count. */
export function simulate(params: SimParams, runs = 30): StratResult[] {
  return [0, 1, 2, 3].map(st => {
    const res: ReturnType<typeof run>[] = [];
    for (let r = 0; r < runs; r++) res.push(run(st, params, 1000 + r));
    const pick = (key: keyof ReturnType<typeof run>) => Float64Array.from({length: TARGET + 1}, (_, k) => median(res.map(x => x[key][k])));
    return {tokens: pick('tokensAt'), hatches: pick('hatchAt'), candies: pick('candyAt'), eggs: pick('eggAt')};
  });
}
