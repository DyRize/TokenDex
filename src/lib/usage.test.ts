import {describe, expect, it} from 'vitest';
import {hourKey, hourProfile, uncounted} from './usage';

describe('uncounted', () => {
  it('names the providers serve.py could not count, and nothing when all are', () => {
    expect(uncounted({hours: {}, sources: [{id: 'claude_code', counted: true}, {id: 'windsurf', counted: false}]})).toEqual(['windsurf']);
    expect(uncounted({hours: {}, sources: [{id: 'claude_code', counted: true}]})).toEqual([]);
    expect(uncounted({hours: {}})).toEqual([]);
    expect(uncounted(null)).toEqual([]);
  });
});

describe('hourProfile', () => {
  it('averages each hour over the 14 full days before today', () => {
    const now = new Date(2026, 8, 30, 15);
    const at = (daysAgo: number, h: number) => hourKey(new Date(2026, 8, 30 - daysAgo, h));
    const prof = hourProfile({[at(1, 10)]: 14e6, [at(14, 10)]: 14e6, [at(15, 10)]: 99e6, [at(0, 10)]: 99e6, [at(3, 22)]: 7e6}, now);
    expect(prof).toHaveLength(24);
    expect(prof[10]).toBeCloseTo(2e6);
    expect(prof[22]).toBeCloseTo(0.5e6);
    expect(prof[9]).toBe(0);
  });

  it('keys hours in local time', () => {
    expect(hourKey(new Date(2026, 0, 2, 3))).toBe('2026-01-02T03');
  });
});
