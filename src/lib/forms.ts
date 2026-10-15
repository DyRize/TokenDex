// An individual carries one form, drawn at hatch; each species of its line shows it if it has it, else its own default.
import {FORMS, LINE_BASE, type FormRow} from '../data/forms';
import {NAMES} from '../data/species';
import {tr} from './i18n';
import {bwSprite} from './sprites';

const lineForms = (baseID: number) => [...new Set(Object.keys(FORMS).map(Number)
  .filter(id => (LINE_BASE[id] ?? id) === baseID).flatMap(id => FORMS[id].map(f => f[0])))];

/** The form an individual of the line carries, as the save stores it: a missing one, or one the line doesn't have, is the line's default. Null for a line without forms. */
export function lineForm(baseID: number, form: unknown): string | null {
  const forms = lineForms(baseID);
  return forms.find(f => f === form) ?? forms[0] ?? null;
}

function nonDefault(id: number, form: string | null): FormRow | null {
  const rows = FORMS[id], row = rows && rows.find(f => f[0] === form);
  return row && row !== rows[0] ? row : null;
}

/** Names the animated sprite and its cache; also a collection key, each form counting as its own species. */
export function formKey(id: number, form: string | null): number | string {
  const row = nonDefault(id, form);
  return row ? `${id}-${row[0]}` : id;
}

/** A static sprite of a form that is its own PokéAPI variety goes by the variety's id. */
export function formSprite(id: number, form: string | null, {shiny = false, animated = false} = {}) {
  const row = nonDefault(id, form);
  return bwSprite(row && !animated && row[3] || formKey(id, form), {shiny, animated});
}

/** As the app writes it: the species, then the name of a non-default form. Unown always names its letter. */
export function formName(id: number, form: string | null) {
  const row = nonDefault(id, form) || (id === 201 ? FORMS[201][0] : null);
  return row ? `${NAMES[id - 1]} [${tr(row[1], row[2])}]` : NAMES[id - 1];
}
