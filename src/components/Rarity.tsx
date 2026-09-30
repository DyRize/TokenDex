import {tr} from '../lib/i18n';
import type {Rarity} from '../lib/save';

export const RLABEL: Record<Rarity, string> = {common: tr('Commun', 'Common'), uncommon: tr('Peu commun', 'Uncommon'), rare: 'Rare', legendary: tr('Légendaire', 'Legendary')};
export const RarityTag = ({rarity}: {rarity: Rarity}) => <span class="tag" style={`--c:var(--r-${rarity})`}>{RLABEL[rarity]}</span>;
