// Each bought egg's type, by hatch number: the purchase serve.py read in the app's log as the Pokémon before it was released, else the player's choice.
import type {State} from '../../lib/save';
import type {Egg} from '../prochains/draw';
import {BY_ID, DITTO, possibleEggs, type KnownEggs} from './luck';

/** An egg purchase as the app logged it, with the base of the next hatch in the log, if any. */
export interface Purchase { at: string; tier: Egg; base: number | null }
// The app stamps the released entry, then writes the log line from a queue.
const SLACK_MS = 5000;
const disguisable = (base: number) => { const l = BY_ID.get(base); return l?.rarity === 'common' && l.evo; };

export function knownEggs(st: State, purchases: Purchase[], chosen: Record<number, Egg>): KnownEggs {
  const bases = [...st.dex.map(d => d.baseID), ...st.active ? [st.active.baseID] : []];
  const known: KnownEggs = new Map();
  st.dex.forEach((d, i) => {
    const n = i + 2, base = bases[i + 1];
    if (!d.releasedAt || base === undefined) return;
    // A revealed Ditto's entry names Ditto, the log the evolving common it hatched disguised as.
    const p = purchases.find(p => d.caughtAt !== null && Math.abs(Date.parse(p.at) - d.caughtAt) <= SLACK_MS
      && (p.base === null || p.base === base || base === DITTO && disguisable(p.base)));
    if (p) known.set(n, {egg: p.tier, from: 'log'});
    else if (possibleEggs(base).includes(chosen[n])) known.set(n, {egg: chosen[n], from: 'player'});
  });
  return known;
}
