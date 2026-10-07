/**
 * The hero as data (army.md §6): how a campaign starts, by background. M2
 * uses what the map can: the start, the party limit, Scouting's sight. The
 * rest of the hero (XP, levels, skills on offer) arrives with M3.
 */
import { CULTURES } from "./troops.js";

/** Everyone starts with these (army.md §6). */
export const START = { gold: 300, iron: 0, horses: 0, levies: 12 };

export const BACKGROUNDS = {
  sellsword: {
    name: "Sellsword",
    text: "+200 gold; Tactics (Basic)",
    gold: 200,
    skills: { tactics: 1 },
  },
  knight: {
    name: "Exiled Knight",
    text: "4 squires and 2 spare horses; Leadership (Basic)",
    troops: { squire: 4 },
    horses: 2,
    skills: { leadership: 1 },
  },
  outlaw: {
    name: "Outlaw",
    text: "+100 gold; Scouting (Basic); brigands won't attack you unprovoked",
    gold: 100,
    skills: { scouting: 1 },
  },
  physician: {
    name: "Physician",
    text: "Medicine (Basic); Cunning +1",
    skills: { medicine: 1 },
    cunning: 1,
  },
};

/**
 * A level-1 hero of a culture and background. The shape is the Skirmish
 * hero's (battle-setup.js `skirmishHero`), so the battle can field it, plus
 * the skills only the map uses.
 */
export function startingHero(culture, background) {
  const bg = BACKGROUNDS[background];
  return {
    level: 1,
    xp: 0,
    culture,
    might: 1,
    guard: 1,
    command: 1,
    cunning: 1 + (bg.cunning ?? 0),
    leadership: 0,
    tactics: 0,
    offense: 0,
    scouting: 0,
    medicine: 0,
    logistics: 0,
    ...bg.skills,
    abilities: ["rally", "holdline", CULTURES[culture].ability],
  };
}

/** Party size (army.md §6): 20 + 2 × level + 8 × Leadership rank + renown / 40. */
export const partyLimit = (hero, renown = 0) =>
  20 + 2 * hero.level + 8 * hero.leadership + Math.floor(renown / 40);
