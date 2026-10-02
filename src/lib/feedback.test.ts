import {describe, expect, it} from 'vitest';
import {version} from '../../package.json';
import bugForm from '../../.github/ISSUE_TEMPLATE/bug.yml?raw';
import ideaForm from '../../.github/ISSUE_TEMPLATE/idea.yml?raw';
import {feedbackURL} from './feedback';

const params = (url: string) => Object.fromEntries(new URL(url).searchParams);

describe('feedbackURL', () => {
  it('sends the version, the page and the language to the template chooser, and nothing else', () => {
    const url = feedbackURL('chance-tirage.html', 'fr');
    expect(url.split('?')[0]).toBe('https://github.com/DyRize/TokenDex/issues/new/choose');
    expect(params(url)).toEqual({version, page: 'chance-tirage.html', lang: 'fr'});
  });

  it('opens the bug form straight away after a crash', () => {
    const url = feedbackURL('journal.html', 'en', true);
    expect(url.split('?')[0]).toBe('https://github.com/DyRize/TokenDex/issues/new');
    expect(params(url)).toEqual({version, page: 'journal.html', lang: 'en', template: 'bug.yml', title: 'Page crashed: journal.html'});
  });

  it('fills fields that both issue forms define', () => {
    for (const form of [bugForm, ideaForm]) {
      for (const id of ['version', 'page', 'lang']) expect(form).toMatch(new RegExp(`^\\s+id: ${id}$`, 'm'));
    }
  });
});
