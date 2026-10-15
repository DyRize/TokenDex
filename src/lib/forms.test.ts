import {describe, expect, it} from 'vitest';
import {FORMS} from '../data/forms';
import {formKey, formName, formSprite, lineForm} from './forms';
import {tr} from './i18n';

const BW = 'sprites/pokemon/versions/generation-v/black-white/';

describe('the form catalog', () => {
  it('gives 106 forms to 23 species, so the Form Pokédex counts 732', () => {
    const species = Object.values(FORMS);
    expect(species).toHaveLength(23);
    expect(species.flat()).toHaveLength(106);
    expect(649 - species.length + species.flat().length).toBe(732);
  });
});

describe('lineForm', () => {
  it('keeps a form the line has', () => {
    expect(lineForm(422, 'east')).toBe('east');
    expect(lineForm(492, 'sky')).toBe('sky');
    expect(lineForm(201, 'question')).toBe('question');
  });

  it("reads a missing or unknown form as the line's default", () => {
    expect(lineForm(422, undefined)).toBe('west');
    expect(lineForm(422, 'sky')).toBe('west');
    expect(lineForm(201, undefined)).toBe('a');
  });

  it('takes the forms of species further down the line', () => {
    expect(lineForm(412, 'trash')).toBe('trash');
    expect(lineForm(420, 'sunshine')).toBe('sunshine');
    expect(lineForm(554, 'zen')).toBe('zen');
    expect(lineForm(420, undefined)).toBe('overcast');
  });

  it('gives no form to a line without any', () => {
    expect(lineForm(1, undefined)).toBeNull();
    expect(lineForm(1, 'b')).toBeNull();
  });
});

describe('formKey', () => {
  it('names a non-default form after its species, and the default after the species alone', () => {
    expect(formKey(492, 'sky')).toBe('492-sky');
    expect(formKey(492, 'land')).toBe(492);
    expect(formKey(201, 'b')).toBe('201-b');
    expect(formKey(201, 'a')).toBe(201);
    expect(formKey(201, null)).toBe(201);
  });

  it('shows the form at each species that has it, and the default elsewhere', () => {
    expect(formKey(412, 'sandy')).toBe('412-sandy');
    expect(formKey(413, 'sandy')).toBe('413-sandy');
    expect(formKey(414, 'sandy')).toBe(414);
    expect(formKey(420, 'sunshine')).toBe(420);
    expect(formKey(421, 'sunshine')).toBe('421-sunshine');
  });
});

describe('formSprite', () => {
  it('names the animated sprite after the species and the form', () => {
    expect(formSprite(492, 'sky', {animated: true})).toBe(BW + 'animated/492-sky.gif');
    expect(formSprite(422, 'east', {animated: true, shiny: true})).toBe(BW + 'animated/shiny/422-east.gif');
    expect(formSprite(492, 'land', {animated: true})).toBe(BW + 'animated/492.gif');
  });

  it('names the static sprite after the variety when the form is one, else after the species and the form', () => {
    expect(formSprite(492, 'sky')).toBe(BW + '10006.png');
    expect(formSprite(492, 'sky', {shiny: true})).toBe(BW + 'shiny/10006.png');
    expect(formSprite(413, 'sandy')).toBe(BW + '10004.png');
    expect(formSprite(412, 'sandy')).toBe(BW + '412-sandy.png');
    expect(formSprite(201, 'question')).toBe(BW + '201-question.png');
    expect(formSprite(414, 'sandy')).toBe(BW + '414.png');
    expect(formSprite(1, null)).toBe(BW + '1.png');
  });
});

describe('formName', () => {
  it('follows the species name with the name of a non-default form', () => {
    expect(formName(492, 'sky')).toBe(tr('Shaymin [Forme Céleste]', 'Shaymin [Sky Forme]'));
    expect(formName(413, 'sandy')).toBe(tr('Cheniselle [Cape Sable]', 'Wormadam [Sandy Cloak]'));
    expect(formName(493, 'fire')).toBe(tr('Arceus [Feu]', 'Arceus [Fire Type]'));
  });

  it('adds nothing for the default form, nor at a species without the form', () => {
    expect(formName(492, 'land')).toBe('Shaymin');
    expect(formName(351, 'normal')).toBe(tr('Morphéo', 'Castform'));
    expect(formName(414, 'sandy')).toBe(tr('Papilord', 'Mothim'));
    expect(formName(1, null)).toBe(tr('Bulbizarre', 'Bulbasaur'));
  });

  it('always names the letter of an Unown', () => {
    expect(formName(201, 'a')).toBe(tr('Zarbi [A]', 'Unown [A]'));
    expect(formName(201, null)).toBe(tr('Zarbi [A]', 'Unown [A]'));
    expect(formName(201, 'k')).toBe(tr('Zarbi [K]', 'Unown [K]'));
    expect(formName(201, 'exclamation')).toBe(tr('Zarbi [!]', 'Unown [!]'));
    expect(formName(201, 'question')).toBe(tr('Zarbi [?]', 'Unown [?]'));
  });
});
