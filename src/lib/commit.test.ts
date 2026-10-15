import {describe, expect, it} from 'vitest';
import {CHECKED_COMMITS, commitNotice} from './commit';

const A = {sha: 'a0ad485251b22a26971653dd49282d66758b462e', date: '2026-10-15 10:32'};
const B = {sha: '1234567aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', date: '2026-10-12 09:05'};
const NEW = 'dec94879726d866aed6fe065d6e6fcf2e993d3be', OLD = '89abcdefbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('commitNotice', () => {
  it.each([
    ['a checked commit', A, [A], null],
    ['an older checked commit', B, [B, A], null],
    ['a newer commit', {sha: NEW, date: '2026-10-15 11:46'}, [A], {kind: 'unchecked', app: {sha: NEW, date: '2026-10-15 11:46'}, lastChecked: A}],
    ['an older commit', {sha: OLD, date: '2026-10-12 09:05'}, [A], {kind: 'outdated', app: {sha: OLD, date: '2026-10-12 09:05'}, lastChecked: A}],
    ['an unlisted commit between two checked ones', {sha: OLD, date: '2026-10-13 18:00'}, [B, A], {kind: 'outdated', app: {sha: OLD, date: '2026-10-13 18:00'}, lastChecked: A}],
    ['an unlisted commit from the same minute as the last checked one', {sha: OLD, date: A.date}, [B, A], {kind: 'outdated', app: {sha: OLD, date: A.date}, lastChecked: A}],
    ['a date that cannot be read', {sha: OLD, date: '12/10/2026'}, [A], {kind: 'unchecked', app: {sha: OLD}, lastChecked: A}],
    ['no date', {sha: OLD}, [A], {kind: 'unchecked', app: {sha: OLD}, lastChecked: A}],
    ['no commit', undefined, [A], null],
  ])('%s', (_, app, checked, notice) => {
    expect(commitNotice(app, checked)).toEqual(notice);
  });

  it('checks against the commits TokenDex was checked against by default, dated and oldest first', () => {
    for (const c of CHECKED_COMMITS) {
      expect(commitNotice(c)).toBeNull();
      expect(c.date).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d$/);
    }
    expect(CHECKED_COMMITS.map(c => c.date)).toEqual(CHECKED_COMMITS.map(c => c.date).sort());
  });
});
