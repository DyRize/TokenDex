import './page.css';
import type {ComponentChildren} from 'preact';
import {Header, NoSave, Tiles, mount, saveEyebrow} from '../../components/Page';
import {FINALS, NAMES} from '../../data/species';
import {CANDY_XP, PRICE, scaled, toGraduation} from '../../lib/balance';
import {tok} from '../../lib/format';
import {useSave, useServed, useSettings} from '../../lib/hooks';
import {tr} from '../../lib/i18n';
import type {Settings, State} from '../../lib/save';
import {EGG_SPRITE, bwSprite, itemSprite, spriteID, withForm} from '../../lib/sprites';
import {hourProfile, uncounted, type Usage} from '../../lib/usage';

type Article = keyof typeof PRICE;
const CANDY = itemSprite('rare-candy'), CHARM = itemSprite('shiny-charm');
const ARTICLES: [Article, string, string, string][] = [
  ['candy', tr('Super Bonbon', 'Rare Candy'), CANDY, tr('100 M d\'XP sur le Pokémon en cours', '100 M XP on the growing Pokémon')],
  ['mint', tr('Menthe', 'Mint'), itemSprite('miracle-seed'), tr('change la nature du Pokémon en cours', 'changes the growing Pokémon\'s nature')],
  ['egg', tr('Œuf', 'Egg'), EGG_SPRITE, tr('tirage normal', 'normal draw')],
  ['uncommonEgg', tr('Œuf Peu commun+', 'Uncommon+ Egg'), EGG_SPRITE, tr('peu commun, rare ou légendaire', 'uncommon, rare or legendary')],
  ['rareEgg', tr('Œuf Rare+', 'Rare+ Egg'), EGG_SPRITE, tr('rare ou légendaire', 'rare or legendary')],
  ['charm', tr('Charme Chroma', 'Shiny Charm'), CHARM, tr('shiny à 1/48 au lieu de 1/64', 'shiny at 1/48 instead of 1/64')],
];
const nCandies = (n: number) => tr(`${n} bonbon${n > 1 ? 's' : ''}`, `${n} Rare Cand${n > 1 ? 'ies' : 'y'}`);
type Act = [cls: 'go' | 'wait' | 'info', img: string, h: string, p: ComponentChildren];

function Advisor({st, settings, perDay, missing}: {st: State; settings: Settings; perDay: number | null; missing: string[]}) {
  const a = st.active, P = Object.fromEntries(Object.entries(PRICE).map(([k, x]) => [k, scaled(x, settings.s)])) as Record<Article, number>;
  const wallet = Math.max(0, st.usedSinceInstall - st.spentTokens), candies = st.inventory.rareCandy || 0;
  const charm = (st.inventory.shinyCharm || 0) > 0, collected = new Set(st.collectedFinals);
  const known = new Set(st.dex.flatMap(d => d.chain)), knownShiny = new Set(st.dex.filter(d => d.isShiny).flatMap(d => d.chain));
  const newShiny = a && a.isShiny ? [...new Set(a.planned)].filter(id => id <= 649 && !knownShiny.has(id)).length : 0;
  const complete = a ? (FINALS[a.baseID] || [a.baseID]).every(f => collected.has(`${a.baseID}:${f}`)) : false;
  const id = a ? a.path[a.stage] || a.baseID : 0, name = a ? withForm(NAMES[id - 1], id, a.unownForm) : '';
  const wait = (n: number) => { if (!perDay) return ''; const h = n / perDay * 24; return ` (≈ ${h < 48 ? Math.max(1, Math.round(h)) + ' h' : Math.round(h / 24) + tr(' jours', ' days')} ${tr('à ton rythme', 'at your pace')})`; };
  const acts: Act[] = [];
  let left = wallet, buyEgg = false;
  if (!a) {
    acts.push(['wait', EGG_SPRITE, tr('Laisse éclore l\'œuf', 'Let the egg hatch'), tr('Pas de Pokémon actif : rien à relâcher, et les bonbons ne servent qu\'à un Pokémon qui grandit.', 'No active Pokémon: nothing to release, and Rare Candies only help a Pokémon that is growing.')]);
  } else if (complete && newShiny) {
    const s = newShiny > 1 ? 's' : '';
    acts.push(['info', bwSprite(spriteID(id, a.unownForm), {shiny: true}), tr(`Fais grandir ${name}`, `Grow ${name}`),
      tr(<>Sa ligne est complète, mais c'est un shiny qui t'apporte <b>{`${newShiny} espèce${s} shiny nouvelle${s}`}</b> : ne le relâche pas.</>,
        <>Its line is complete, but it is a shiny that brings you <b>{`${newShiny} new shiny species`}</b>: don't release it.</>)]);
  } else if (complete) {
    if (wallet >= P.rareEgg) {
      buyEgg = true; left -= P.rareEgg;
      acts.push(['go', EGG_SPRITE, tr(`Relâche ${name} et achète un œuf Rare+`, `Release ${name} and buy a Rare+ Egg`),
        tr(<>Sa ligne est déjà complète : le graduer n'ajoute rien au Pokédex. L'œuf coûte <b>{tok(P.rareEgg)}</b>, il te restera <b>{tok(left)}</b>.</>,
          <>Its line is already complete: graduating it adds nothing to the Pokédex. The egg costs <b>{tok(P.rareEgg)}</b>, leaving you <b>{tok(left)}</b>.</>)]);
    } else {
      const missing = P.rareEgg - wallet;
      acts.push(['wait', EGG_SPRITE, tr(`Garde ${name} en attendant ${tok(P.rareEgg)}`, `Keep ${name} until you have ${tok(P.rareEgg)}`),
        tr(<>Sa ligne est complète, donc c'est un doublon : dès que ton solde atteint <b>{tok(P.rareEgg)}</b>, relâche-le pour un œuf Rare+. Il manque <b>{tok(missing)}</b>{`${wait(missing)}.`}</>,
          <>Its line is complete, so it is a duplicate: once your balance reaches <b>{tok(P.rareEgg)}</b>, release it for a Rare+ Egg. <b>{tok(missing)}</b>{` to go${wait(missing)}.`}</>)]);
    }
  } else {
    const fresh = [...new Set(a.planned)].filter(id => !known.has(id)).length, s = fresh > 1 ? 's' : '';
    acts.push(['info', bwSprite(spriteID(id, a.unownForm), {shiny: a.isShiny}), tr(`Fais grandir ${name}`, `Grow ${name}`), fresh
      ? tr(<>Sa ligne t'apporte <b>{`${fresh} espèce${s} nouvelle${s}`}</b> : pas question de le relâcher.</>, <>Its line brings you <b>{`${fresh} new species`}</b>: don't release it.</>)
      : tr('Sa ligne n\'est pas encore complète : une forme finale te manque encore.', 'Its line is not complete yet: you still miss a final form.')]);
  }
  const reserve = P.rareEgg, surplus = left - reserve, buy = Math.max(0, Math.floor(surplus / P.candy));
  if (buy > 0) {
    const kept = tok(left - buy * P.candy);
    acts.push(['go', CANDY, `${tr('Achète', 'Buy')} ${nCandies(buy)}`, <>{`${buy} × ${tok(P.candy)} = `}<b>{tok(buy * P.candy)}</b>
      {tr(<>. Tu gardes <b>{kept}</b>{`, dont ${tok(reserve)} pour le prochain Rare+.`}</>, <>. You keep <b>{kept}</b>{`, ${tok(reserve)} of it for the next Rare+.`}</>)}</>]);
  } else {
    acts.push(['info', CANDY, tr('N\'achète pas de bonbon', 'Don\'t buy Rare Candies'), left < reserve
      ? tr(`Ton solde (${tok(left)}) est sous la réserve d'un œuf Rare+ (${tok(reserve)}) : garde tout.`, `Your balance (${tok(left)}) is below the reserve for a Rare+ Egg (${tok(reserve)}): keep it all.`)
      : tr(`Au-dessus de la réserve de ${tok(reserve)}, il te reste ${tok(surplus)}, moins qu'un bonbon (${tok(P.candy)}).`, `Above the ${tok(reserve)} reserve you have ${tok(surplus)} left, less than one Rare Candy (${tok(P.candy)}).`)]);
  }
  const stock = candies + buy;
  if (a && !buyEgg && stock) {
    const need = toGraduation(a, settings.g), use = Math.min(stock, Math.floor(need / CANDY_XP));
    acts.push(use
      ? ['go', CANDY, tr(`Donne ${nCandies(use)} à ${name}`, `Give ${nCandies(use)} to ${name}`),
        tr(<>Il lui reste <b>{tok(need)}</b>{` avant graduation : ${use} × 100 M passent sans perte.${stock > use ? ` Garde les ${stock - use} autres pour le suivant.` : ''}`}</>,
          <>It needs <b>{tok(need)}</b>{` before graduation: ${use} × 100 M go in without waste.${stock > use ? ` Keep the other ${stock - use} for the next one.` : ''}`}</>)]
      : ['info', CANDY, tr(`Garde tes ${nCandies(stock)}`, `Keep your ${nCandies(stock)}`),
        tr(<>Il ne reste que <b>{tok(need)}</b>{` à ${name} : un bonbon de 100 M en perdrait une partie à la graduation.`}</>,
          <>{`${name} only needs `}<b>{tok(need)}</b>: a 100 M Rare Candy would lose part of it at graduation.</>)]);
  } else if (buyEgg && stock) {
    acts.push(['info', CANDY, tr(`Garde tes ${nCandies(stock)}`, `Keep your ${nCandies(stock)}`), tr('Pour le Pokémon qui sortira de l\'œuf Rare+.', 'For the Pokémon that hatches from the Rare+ Egg.')]);
  }
  if (!charm) acts.push(['info', CHARM, tr(`Charme Chroma : ${tok(P.charm)}, seulement pour les shiny`, `Shiny Charm: ${tok(P.charm)}, for shinies only`),
    tr('Il ne fait pas avancer le Pokédex. À prendre si tu vises aussi le dex shiny, après la réserve du Rare+.', 'It does not move the Pokédex forward. Get it if you also chase the shiny dex, after the Rare+ reserve.')]);
  return <>
    <section class="panel" aria-label={tr('Ton porte-monnaie', 'Your wallet')}>
      <Tiles items={[
        [tr('Solde', 'Balance'), tok(wallet), tr(`${tok(st.spentTokens)} déjà dépensés`, `${tok(st.spentTokens)} already spent`)],
        [tr('Bonbons', 'Rare Candies'), String(candies), tr(`valent ${tok(candies * CANDY_XP)} d'XP`, `worth ${tok(candies * CANDY_XP)} XP`)],
        [tr('En cours', 'Growing'), a ? name : tr('Œuf', 'Egg'), a ? (complete ? newShiny ? tr('ligne complète, shiny à garder', 'complete line, a shiny to keep') : tr('ligne complète : doublon', 'complete line: duplicate') : tr('ligne à compléter', 'line to complete')) : tr('entre deux Pokémon', 'between two Pokémon')],
        [tr('Réserve Rare+', 'Rare+ reserve'), tok(P.rareEgg), wallet >= P.rareEgg ? tr('atteinte', 'reached') : tr(`il manque ${tok(P.rareEgg - wallet)}`, `${tok(P.rareEgg - wallet)} to go`)],
      ]} />
      <p class="hint">{settings.live
        ? tr(`Réglages lus dans l'app : croissance ${settings.g} %, boutique ${settings.s} %.`, `Settings read from the app: growth ${settings.g}%, shop ${settings.s}%.`)
        : tr(`Réglages : croissance ${settings.g} %, boutique ${settings.s} % (ceux saisis sur Prochains, sans serveur local).`, `Settings: growth ${settings.g}%, shop ${settings.s}% (the ones typed on Next, no local server).`)}</p>
      {perDay && missing.length > 0 && <p class="hint">{tr(`Attentes estimées sans les tokens de ${missing.join(', ')}, que le serveur local ne sait pas lire : l'app les compte, donc ton solde devrait monter plus vite qu'annoncé.`,
        `Waits estimated without the ${missing.join(', ')} tokens, which the local server cannot read: the app counts them, so your balance should grow faster than shown.`)}</p>}
    </section>
    <section class="panel" aria-label={tr('À faire maintenant', 'Do this now')}>
      <div class="panel-head"><h2>{tr('À faire maintenant', 'Do this now')}</h2><p>{tr('Dans l\'ordre.', 'In order.')}</p></div>
      <ol class="actions">
        {acts.map(([cls, img, h, p]) => <li key={h} class={`act ${cls}`}><img alt="" src={img} /><div><h3>{h}</h3><p>{p}</p></div></li>)}
      </ol>
    </section>
    <section class="panel" aria-label={tr('Prix', 'Prices')}>
      <div class="panel-head"><h2>{tr('Les prix avec tes réglages', 'Prices with your settings')}</h2><p>{tr(`Prix de base × ${settings.s} %.`, `Base price × ${settings.s}%.`)}</p></div>
      <div class="scroller">
        <table class="prices">
          <thead><tr><th>{tr('Article', 'Item')}</th><th class="num">{tr('Prix', 'Price')}</th><th class="num">{tr('Pour toi', 'For you')}</th></tr></thead>
          <tbody>
            {ARTICLES.map(([k, label, img, what]) => {
              const p = P[k];
              return (
                <tr key={k}>
                  <td><span class="it"><img alt="" src={img} />{label}</span><span class="hint">{what}</span></td>
                  <td class="num">{tok(p)}</td>
                  <td class="num">{k === 'charm' && charm ? <span class="ok">{tr('déjà à toi', 'already yours')}</span>
                    : wallet >= p ? <span class="ok">{tr('dans tes moyens', 'within reach')}</span> : tr(`il manque ${tok(p - wallet)}`, `${tok(p - wallet)} to go`)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
    <section class="panel" aria-label={tr('Pourquoi', 'Why')}>
      <div class="panel-head"><h2>{tr('Pourquoi cette règle', 'Why this rule')}</h2></div>
      <div class="why">
        {tr(<>
          <p>Le Chrono a simulé quatre façons de dépenser : sans boutique, tout en bonbons, Rare+ sur doublon, et Rare+ seulement en fin de partie. <b>Rare+ sur doublon</b> gagne à tous les réglages testés : aux réglages par défaut de l'app (100 % de croissance, 100 % de boutique, 253 M par jour), il finit les 649 espèces en 80 ans environ, contre 158 ans tout en bonbons et 184 ans sans boutique.</p>
          <p>L'idée : un Pokémon dont la ligne est déjà complète n'apporte plus rien au Pokédex. Plutôt que de le faire grandir, tu le relâches et tu achètes un œuf Rare+, qui ne tire que des lignes rares ou légendaires, celles qui manquent le plus longtemps. Pour pouvoir le faire à chaque doublon, tu gardes toujours le prix d'un Rare+ de côté, et tout ce qui dépasse part en bonbons.</p>
          <p>Les bonbons, eux, se mettent sur le Pokémon en cours. L'XP en trop passe à la forme suivante quand il évolue, mais elle est perdue à la graduation : on n'en met donc jamais plus que ce qu'il lui reste.</p>
        </>, <>
          <p>Chrono simulated four ways of spending: no shop, all in Rare Candies, Rare+ on duplicates, and Rare+ only in the endgame. <b>Rare+ on duplicates</b> wins at every setting tested: at the app's default settings (100% growth, 100% shop, 253 M a day), it finishes the 649 species in about 80 years, against 158 years all in Rare Candies and 184 years without the shop.</p>
          <p>The idea: a Pokémon whose line is already complete adds nothing to the Pokédex. Instead of growing it, you release it and buy a Rare+ Egg, which only draws rare or legendary lines, the ones missing the longest. To do that on every duplicate, you always keep the price of a Rare+ aside, and everything above it goes into Rare Candies.</p>
          <p>Rare Candies go on the growing Pokémon. Extra XP carries over to the next form when it evolves, but is lost at graduation, so never give it more than it still needs.</p>
        </>)}
      </div>
    </section>
  </>;
}

function App() {
  const {save} = useSave();
  const [settings] = useSettings();
  const usage = useServed<Usage>('usage.json');
  const perDay = usage && (hourProfile(usage.hours, new Date()).reduce((x, y) => x + y, 0) || null);
  return (
    <div class="wrap">
      <Header eyebrow={saveEyebrow(save)} title={tr('Conseiller boutique', 'Shop advisor')} save={save} lede={tr(
        <>Quoi acheter maintenant, et sur qui utiliser tes bonbons, d'après ton solde, ton Pokémon en cours et tes réglages. La règle suivie est la stratégie la plus rapide du <a href="chrono-pokedex.html">Chrono</a> pour finir le Pokédex.</>,
        <>What to buy now, and which Pokémon gets your Rare Candies, based on your balance, your growing Pokémon and your settings. The rule it follows is the fastest strategy from <a href="chrono-pokedex.html">Chrono</a> to finish the Pokédex.</>)} />
      {save ? <Advisor st={save.st} settings={settings} perDay={perDay} missing={uncounted(usage)} /> : <section class="panel"><NoSave /></section>}
      <footer>
        {tr(<p>Prix repris de l'app (<code>RareCandy</code>, <code>ShinyCharm</code>, <code>FreshEgg</code>) multipliés par ton curseur de boutique. Solde = tokens depuis l'installation moins tes achats, comme dans l'app. Acheter un œuf demande un Pokémon actif, qui est relâché.</p>,
          <p>Prices taken from the app (<code>RareCandy</code>, <code>ShinyCharm</code>, <code>FreshEgg</code>) times your shop slider. Balance = tokens since install minus your purchases, like in the app. Buying an egg needs an active Pokémon, which gets released.</p>)}
      </footer>
    </div>
  );
}

mount(tr('Conseiller boutique', 'Shop advisor'), App);
