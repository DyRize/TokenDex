import {LOCALE, tr} from './i18n';

export const fmtSaveDate = (ms: number) => new Date(ms).toLocaleString(LOCALE, {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
// Below 10 M the rounding to a whole million hid real amounts: an egg at 10 % growth costs 500 k, not "1 M".
export const tok = (n: number) => n >= 1e9 ? (n / 1e9).toLocaleString(LOCALE, {minimumFractionDigits: 2, maximumFractionDigits: 2}) + tr(' Md', ' B')
  : n >= 1e6 || n === 0 ? (n / 1e6).toLocaleString(LOCALE, {maximumFractionDigits: n >= 1e7 ? 0 : 1}) + ' M'
  : n < 1e3 ? '< 1 k' : Math.round(n / 1e3).toLocaleString(LOCALE) + ' k';
