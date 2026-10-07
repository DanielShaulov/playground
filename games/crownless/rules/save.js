/**
 * The save (tech.md §4). M1 saves one Skirmish: its setup, the odds it was
 * shown at, where it is (deploying, planning, over), the whole battle as the
 * rules keep it, and the result once there is one. The campaign joins it in
 * M2 under the same key.
 *
 * Any incompatible change bumps SAVE_V; a save from another version is not
 * loaded (settings and the best record live under their own keys).
 */
export const SAVE_V = 1;

/** Warn past this many characters of JSON (tech.md §4's 200 KB). */
const WARN_AT = 200_000;

/** The save if it is one this version can resume, else null. */
export function readSave(s) {
  if (!s || typeof s !== "object" || s.v !== SAVE_V || !s.battle) return null;
  return s;
}

/** Build the save object; complains in the console if it grows too big. */
export function makeSave({ setup, odds, phase, battle, result }) {
  const save = { v: SAVE_V, setup, odds, phase, battle, result };
  const size = JSON.stringify(save).length;
  if (size > WARN_AT) console.warn(`crownless: save is ${Math.round(size / 1000)} KB`);
  return save;
}
