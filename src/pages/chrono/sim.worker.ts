import {simulate, type SimParams} from './sim';

// With free Rare Candies the result depends on the daily rate: each row of the grid then gets its own, lighter run.
onmessage = (e: MessageEvent<{params: SimParams; rates: number[]}>) => {
  const {params, rates} = e.data;
  postMessage({res: simulate(params, 30)});
  if (params.freeWeek) postMessage({byRate: Object.fromEntries(rates.map(r => [r, simulate({...params, rate: r}, 10).map(x => x.tokens)]))});
};
