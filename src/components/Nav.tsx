import {version} from '../../package.json';
import {feedbackURL} from '../lib/feedback';
import {LANG, setLang, tr} from '../lib/i18n';
import './nav.css';

const PAGES = [
  ['index.html', 'Pokédex'],
  ['encours.html', tr('En cours', 'Growing')],
  ['journal.html', 'Journal'],
  ['carte.html', tr('Carte', 'Card')],
  ['boutique.html', tr('Boutique', 'Shop')],
  ['prochains-pokemon.html', tr('Prochains', 'Next')],
  ['chance-tirage.html', tr('Chance', 'Luck')],
  ['chrono-pokedex.html', 'Chrono'],
];
// "alpha" in 0.1.0-alpha.1, nothing once released.
const STAGE = version.split('-')[1]?.split('.')[0];
export const currentPage = () => decodeURIComponent(location.pathname.split('/').pop() || '') || 'index.html';

export function Nav() {
  const here = currentPage();
  const feedback = tr('Signaler un bug ou proposer une idée', 'Report a bug or suggest an idea');
  return (
    <nav class="ptb-nav" aria-label="TokenDex">
      <div class="in">
        <a class="brand" href="index.html"><span>TokenDex</span></a>
        {STAGE && <span class="stage" title={`Version ${version}`}>{STAGE}</span>}
        <div class="tabs">
          {PAGES.map(([href, label]) => <a key={href} href={href} aria-current={href === here ? 'page' : undefined}>{label}</a>)}
        </div>
        <button type="button" class="lang" lang={tr('en', 'fr')} title={tr('English', 'Français')} onClick={() => setLang(tr('en', 'fr'))}>
          {tr('EN', 'FR')}
        </button>
        <a class="feedback" href={feedbackURL(here, LANG)} target="_blank" rel="noopener" title={feedback} aria-label={feedback} />
      </div>
    </nav>
  );
}
