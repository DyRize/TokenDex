/* Hourly usage from serve.py's usage.json, keyed by local hour. */
export type Hours = Record<string, number>;
export const hourKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}`;
// Average tokens for each hour of the day over the last 14 full days.
export function hourProfile(hours: Hours, now: Date | number) {
  const prof = new Array<number>(24).fill(0), d = new Date(now); d.setHours(0, 0, 0, 0);
  for (let day = 1; day <= 14; day++) {
    const base = new Date(d); base.setDate(d.getDate() - day);
    for (let h = 0; h < 24; h++) { base.setHours(h); prof[h] += (hours[hourKey(base)] || 0) / 14; }
  }
  return prof;
}
