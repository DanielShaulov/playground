// @ts-check
/**
 * The four talents. A keeper picks one on the first screen and keeps it.
 * The numbers each talent changes sit beside it; the core reads them through
 * keeper.js talentOf().
 *
 *   bloomDays   days added to the end of every bloom window
 *   pay         what every customer pays, as a multiple (the grocer does not)
 *   growDays    growth days a colony needs for one strength
 *   mites       how fast mites rise, as a multiple
 *   crafts      extra crafts a day
 *   wax         change to the wax a recipe needs (never below 1)
 */

/**
 * @typedef {{
 *   id: string, name: string, blurb: string, bloomDays?: number, pay?: number,
 *   growDays?: number, mites?: number, crafts?: number, wax?: number
 * }} Talent
 */

/** @type {Record<string, Talent>} */
export const TALENTS = {
  "green-thumb": {
    id: "green-thumb",
    name: "Green thumb",
    blurb: "Every flower blooms a day longer for you.",
    bloomDays: 1,
  },
  selling: {
    id: "selling",
    name: "Gift for selling",
    blurb: "Every customer pays 10% more.",
    pay: 1.1,
  },
  whisperer: {
    id: "whisperer",
    name: "Bee whisperer",
    blurb: "Your colonies grow twice as fast, and mites are slower to take hold.",
    growDays: 1,
    mites: 0.7,
  },
  "clever-hands": {
    id: "clever-hands",
    name: "Clever hands",
    blurb: "Make 1 more thing a day, and recipes take less beeswax.",
    crafts: 1,
    wax: -1,
  },
};

export const TALENT_IDS = Object.keys(TALENTS);
