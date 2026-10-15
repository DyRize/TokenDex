// A PokeTokenLBI commit, dated like PTBCommitDate in the app's Info.plist: "2026-10-15 10:32".
export interface Commit { sha: string; date?: string }

// PokeTokenLBI commits whose rules TokenDex was checked against, oldest first: add one when checking it changed nothing, replace the list when it changed a rule.
export const CHECKED_COMMITS: Required<Commit>[] = [{sha: 'a0ad485251b22a26971653dd49282d66758b462e', date: '2026-10-15 10:32'}];

export interface CommitNotice { kind: 'unchecked' | 'outdated'; app: Commit; lastChecked: Required<Commit> }

export function commitNotice(app: Commit | undefined, checked = CHECKED_COMMITS): CommitNotice | null {
  if (!app || checked.some(c => c.sha === app.sha)) return null;
  const lastChecked = checked[checked.length - 1], date = app.date && /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(app.date) ? app.date : undefined;
  return {kind: date && date <= lastChecked.date ? 'outdated' : 'unchecked', app: {sha: app.sha, date}, lastChecked};
}
