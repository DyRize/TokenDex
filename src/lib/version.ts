// App versions whose rules TokenDex was checked against, oldest first: add one when checking it changed nothing, replace the list when it changed a rule.
export const CHECKED_VERSIONS = ['2.5.5'];

export interface VersionNotice { kind: 'unchecked' | 'outdated'; app: string; lastChecked: string }

const parts = (v: string) => /^\d+(\.\d+)*$/.test(v) ? v.split('.').map(Number) : null;
function older(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0);
  return false;
}

export function versionNotice(app: string | undefined, checked = CHECKED_VERSIONS): VersionNotice | null {
  if (!app || checked.includes(app)) return null;
  const lastChecked = checked[checked.length - 1], v = parts(app);
  return {kind: v && older(v, parts(lastChecked)!) ? 'outdated' : 'unchecked', app, lastChecked};
}
