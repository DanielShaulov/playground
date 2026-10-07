/**
 * The campaign's save (tech.md §4), under its own key
 * (`playground:crownless:campaign`) so that a Skirmish in progress and a
 * campaign never overwrite each other. The state from world.js is the save:
 * plain JSON, terrain regenerated from its seed.
 *
 * Any incompatible change bumps CAMPAIGN_V — and any change to what
 * worldgen makes of a seed is one (tech.md §3). A save from another version
 * is not loaded; the title offers a new campaign instead.
 */
export const CAMPAIGN_V = 2;

/** Warn past this many characters of JSON (tech.md §4's 200 KB). */
const WARN_AT = 200_000;

/** The campaign if this version can resume it, else null. */
export function readCampaign(s) {
  if (!s || typeof s !== "object" || s.v !== CAMPAIGN_V || !s.player) return null;
  return s;
}

/** Was there a campaign under the key that this version can't read? */
export const staleCampaign = (s) => !!s && typeof s === "object" && s.v !== CAMPAIGN_V;

/** The save object for a state; complains in the console if it grows too big. */
export function makeCampaign(state) {
  const save = { ...state, v: CAMPAIGN_V };
  const size = JSON.stringify(save).length;
  if (size > WARN_AT) console.warn(`crownless: campaign save is ${Math.round(size / 1000)} KB`);
  return save;
}
