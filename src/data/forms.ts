// PokeTokenLBI's PokemonForm.catalog at a0ad485, default first; names from PokéAPI's pokemon-form, except the app's "Normal Form" for a usual look PokéAPI leaves unnamed.
export type FormRow = readonly [form: string, fr: string, en: string, variety?: number];

export const unownSymbol = (form: string) => form === 'exclamation' ? '!' : form === 'question' ? '?' : form.toUpperCase();
const UNOWN: FormRow[] = [...'abcdefghijklmnopqrstuvwxyz'.split(''), 'exclamation', 'question'].map(f => [f, unownSymbol(f), unownSymbol(f)]);

export const FORMS: Readonly<Record<number, readonly FormRow[]>> = {
  201: UNOWN,
  351: [['normal', 'Forme Normale', 'Normal Form'], ['sunny', 'Forme Solaire', 'Sunny Form', 10013], ['rainy', 'Forme Eau de Pluie', 'Rainy Form', 10014], ['snowy', 'Forme Blizzard', 'Snowy Form', 10015]],
  386: [['normal', 'Forme Normale', 'Normal Forme'], ['attack', 'Forme Attaque', 'Attack Forme', 10001], ['defense', 'Forme Défense', 'Defense Forme', 10002], ['speed', 'Forme Vitesse', 'Speed Forme', 10003]],
  412: [['plant', 'Cape Plante', 'Plant Cloak'], ['sandy', 'Cape Sable', 'Sandy Cloak'], ['trash', 'Cape Déchet', 'Trash Cloak']],
  413: [['plant', 'Cape Plante', 'Plant Cloak'], ['sandy', 'Cape Sable', 'Sandy Cloak', 10004], ['trash', 'Cape Déchet', 'Trash Cloak', 10005]],
  421: [['overcast', 'Temps Couvert', 'Overcast Form'], ['sunshine', 'Temps Ensoleillé', 'Sunshine Form']],
  422: [['west', 'Mer Occident', 'West Sea'], ['east', 'Mer Orient', 'East Sea']],
  423: [['west', 'Mer Occident', 'West Sea'], ['east', 'Mer Orient', 'East Sea']],
  479: [['normal', 'Forme Normale', 'Normal Form'], ['heat', 'Motisma Chaleur', 'Heat Rotom', 10008], ['wash', 'Motisma Lavage', 'Wash Rotom', 10009], ['frost', 'Motisma Froid', 'Frost Rotom', 10010], ['fan', 'Motisma Hélice', 'Fan Rotom', 10011], ['mow', 'Motisma Tonte', 'Mow Rotom', 10012]],
  487: [['altered', 'Forme Alternative', 'Altered Forme'], ['origin', 'Forme Originelle', 'Origin Forme', 10007]],
  492: [['land', 'Forme Terrestre', 'Land Forme'], ['sky', 'Forme Céleste', 'Sky Forme', 10006]],
  493: [['normal', 'Normal', 'Normal Type'], ['fighting', 'Combat', 'Fighting Type'], ['flying', 'Vol', 'Flying Type'], ['poison', 'Poison', 'Poison Type'], ['ground', 'Sol', 'Ground Type'], ['rock', 'Roche', 'Rock Type'], ['bug', 'Insecte', 'Bug Type'], ['ghost', 'Spectre', 'Ghost Type'], ['steel', 'Acier', 'Steel Type'], ['fire', 'Feu', 'Fire Type'], ['water', 'Eau', 'Water Type'], ['grass', 'Plante', 'Grass Type'], ['electric', 'Électrik', 'Electric Type'], ['psychic', 'Psy', 'Psychic Type'], ['ice', 'Glace', 'Ice Type'], ['dragon', 'Dragon', 'Dragon Type'], ['dark', 'Ténèbres', 'Dark Type'], ['fairy', 'Fée', 'Fairy Type']],
  550: [['red-striped', 'Motif Rouge', 'Red-Striped Form'], ['blue-striped', 'Motif Bleu', 'Blue-Striped Form', 10016]],
  555: [['standard', 'Mode Normal', 'Standard Mode'], ['zen', 'Mode Transe', 'Zen Mode', 10017]],
  585: [['spring', 'Forme Printemps', 'Spring Form'], ['summer', 'Forme Été', 'Summer Form'], ['autumn', 'Forme Automne', 'Autumn Form'], ['winter', 'Forme Hiver', 'Winter Form']],
  586: [['spring', 'Forme Printemps', 'Spring Form'], ['summer', 'Forme Été', 'Summer Form'], ['autumn', 'Forme Automne', 'Autumn Form'], ['winter', 'Forme Hiver', 'Winter Form']],
  641: [['incarnate', 'Forme Avatar', 'Incarnate Forme'], ['therian', 'Forme Totémique', 'Therian Forme', 10019]],
  642: [['incarnate', 'Forme Avatar', 'Incarnate Forme'], ['therian', 'Forme Totémique', 'Therian Forme', 10020]],
  645: [['incarnate', 'Forme Avatar', 'Incarnate Forme'], ['therian', 'Forme Totémique', 'Therian Forme', 10021]],
  646: [['normal', 'Forme Normale', 'Normal Form'], ['black', 'Kyurem Noir', 'Black Kyurem', 10022], ['white', 'Kyurem Blanc', 'White Kyurem', 10023]],
  647: [['ordinary', 'Aspect Normal', 'Ordinary Form'], ['resolute', 'Aspect Décidé', 'Resolute Form', 10024]],
  648: [['aria', 'Forme Chant', 'Aria Forme'], ['pirouette', 'Forme Danse', 'Pirouette Forme', 10018]],
  649: [['normal', 'Forme Normale', 'Normal Form'], ['douse', 'Module Aqua', 'Douse Drive'], ['shock', 'Module Choc', 'Shock Drive'], ['burn', 'Module Pyro', 'Burn Drive'], ['chill', 'Module Cryo', 'Chill Drive']],
};

/** The species with forms whose line starts at another species: Wormadam, Cherrim, Gastrodon, Darmanitan and Sawsbuck. */
export const LINE_BASE: Readonly<Record<number, number>> = {413: 412, 421: 420, 423: 422, 555: 554, 586: 585};
