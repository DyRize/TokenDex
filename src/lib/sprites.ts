const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/';
export const EGG_SPRITE = SPRITES + 'pokemon/egg.png';
export const itemSprite = (name: string) => `${SPRITES}items/${name}.png`;
// Black & White sprites; the animated ones are GIFs.
export const bwSprite = (id: number | string, {shiny = false, animated = false} = {}) =>
  `${SPRITES}pokemon/versions/generation-v/black-white/${animated ? 'animated/' : ''}${shiny ? 'shiny/' : ''}${id}.${animated ? 'gif' : 'png'}`;

/* Unown (#201) keeps its letter since the app's Unown forms (#288). PokeAPI names the sprites 201-b … 201-z,
   201-exclamation, 201-question; A stays 201, like saves from before the letters. The result also works as a
   collection key: two Unown with different letters are different catches. */
export const spriteID = (id: number, form?: string | null) => id === 201 && form && form !== 'a' ? `201-${form}` : id;
const unownSymbol = (form?: string | null) => form === 'exclamation' ? '!' : form === 'question' ? '?' : (form || 'a').toUpperCase();
export const withForm = (name: string, id: number, form?: string | null) => id === 201 ? `${name} [${unownSymbol(form)}]` : name;
