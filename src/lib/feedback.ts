import {version} from '../../package.json';
import type {Lang} from './i18n';

const NEW_ISSUE = 'https://github.com/DyRize/TokenDex/issues/new';

export function feedbackURL(page: string, lang: Lang, crashed = false) {
  const q = new URLSearchParams({version, page, lang});
  if (!crashed) return `${NEW_ISSUE}/choose?${q}`;
  q.set('template', 'bug.yml');
  q.set('title', `Page crashed: ${page}`);
  return `${NEW_ISSUE}?${q}`;
}
