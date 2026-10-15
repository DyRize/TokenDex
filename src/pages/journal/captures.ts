import type {DexEntry} from '../../lib/save';
import {formKey} from '../../lib/forms';
import {hourKey, type Hours} from '../../lib/usage';

// Tokens burnt between two instants, spreading each hour's total evenly over the hour.
function tokensBetween(hours: Hours, t0: number, t1: number) {
  let sum = 0;
  const h = new Date(t0); h.setMinutes(0, 0, 0);
  for (; h.getTime() < t1; h.setHours(h.getHours() + 1)) {
    const a = Math.max(t0, h.getTime()), b = Math.min(t1, h.getTime() + 3600e3);
    if (b > a) sum += (hours[hourKey(h)] || 0) * (b - a) / 3600e3;
  }
  return sum;
}

export interface Capture { d: DexEntry; finalId: number; at: number; dupe: boolean; dur: number | null; tokens: number | null }
export function captures(dex: DexEntry[], hours: Hours | null): Capture[] {
  const list = dex.filter((d): d is DexEntry & {caughtAt: number} => !!d.caughtAt && !d.releasedAt).sort((a, b) => a.caughtAt - b.caughtAt);
  const seen = new Set<number | string>();
  return list.map((d, i) => {
    const prev = i ? list[i - 1].caughtAt : null, finalId = d.chain.filter(id => id <= 649).pop() || d.finalID;
    const c = {d, finalId, at: d.caughtAt,
      dupe: d.chain.every(id => seen.has(formKey(id, d.form))),
      dur: prev ? d.caughtAt - prev : null, tokens: prev && hours ? tokensBetween(hours, prev, d.caughtAt) : null};
    d.chain.forEach(id => seen.add(formKey(id, d.form)));
    return c;
  });
}

export interface DuplicatedSpecies { finalId: number; form: string | null; copies: number }
export function duplicatedSpecies(caps: Capture[]): DuplicatedSpecies[] {
  const key = (c: Capture) => formKey(c.finalId, c.d.form);
  const duped = new Set(caps.filter(c => c.dupe).map(key)), rows = new Map<number | string, DuplicatedSpecies>();
  for (const c of caps.filter(c => duped.has(key(c)))) {
    const row = rows.get(key(c));
    if (row) row.copies++;
    else rows.set(key(c), {finalId: c.finalId, form: c.d.form, copies: 1});
  }
  return [...rows.values()].sort((a, b) => b.copies - a.copies || a.finalId - b.finalId);
}
