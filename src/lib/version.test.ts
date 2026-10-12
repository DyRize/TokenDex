import {describe, expect, it} from 'vitest';
import {CHECKED_VERSIONS, versionNotice} from './version';

describe('versionNotice', () => {
  it.each([
    ['a checked version', '2.5.5', ['2.5.5'], null],
    ['an older checked version', '2.5.5', ['2.5.5', '2.6.0'], null],
    ['a newer version', '2.6.0', ['2.5.5'], {kind: 'unchecked', app: '2.6.0', lastChecked: '2.5.5'}],
    ['2.10.0 against 2.9.0', '2.10.0', ['2.9.0'], {kind: 'unchecked', app: '2.10.0', lastChecked: '2.9.0'}],
    ['an older version', '2.5.4', ['2.5.5'], {kind: 'outdated', app: '2.5.4', lastChecked: '2.5.5'}],
    ['an older version, against the last checked', '2.5.6', ['2.5.5', '2.6.0'], {kind: 'outdated', app: '2.5.6', lastChecked: '2.6.0'}],
    ['a version that cannot be ordered', '2.5.4-beta', ['2.5.5'], {kind: 'unchecked', app: '2.5.4-beta', lastChecked: '2.5.5'}],
    ['no version', undefined, ['2.5.5'], null],
  ])('%s', (_, app, checked, notice) => {
    expect(versionNotice(app, checked)).toEqual(notice);
  });

  it('checks against the versions TokenDex was checked against by default', () => {
    for (const v of CHECKED_VERSIONS) expect(versionNotice(v)).toBeNull();
  });
});
