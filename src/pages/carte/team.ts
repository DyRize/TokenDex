// Team edits on the card's ordered picks, the first being the lead.
export function move(ids: string[], from: number, to: number) {
  const rest = ids.filter((_, i) => i !== from);
  rest.splice(to, 0, ids[from]);
  return rest;
}
export const replace = (ids: string[], at: number, id: string) => ids.map((x, i) => i === at ? id : x);
export function toggle(ids: string[], id: string) {
  if (ids.includes(id)) return ids.filter(x => x !== id);
  return ids.length < 6 ? [...ids, id] : null;
}
export const lead = (ids: string[], id: string) => [id, ...ids.filter(x => x !== id)];
