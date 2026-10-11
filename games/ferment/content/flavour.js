// @ts-check
/** Flavour bands on the 0 (crisp) → 1 (funky) strip. Each band runs [lo, hi). */

/** @type {{ id: string, lo: number, hi: number }[]} */
export const BANDS = [
  { id: "crisp", lo: 0, hi: 0.3 },
  { id: "tangy", lo: 0.3, hi: 0.55 },
  { id: "sour", lo: 0.55, hi: 0.8 },
  { id: "funky", lo: 0.8, hi: 1 },
];
