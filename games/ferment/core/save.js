// @ts-check
/**
 * Save backup codes: a whole shop as one line of text the player can copy
 * somewhere safe and paste back later, on this phone or another.
 *
 *   saveCode(state)   → "BRINE1.<base64url JSON>.<checksum>"
 *   readCode(text)    → { ok: true, state } | { ok: false, why }
 *
 * The checksum catches a code that was cut short or mistyped, so a damaged
 * code is turned away before loadSave() ever sees it. Whatever survives the
 * checksum still goes through loadSave(), the same gate a stored save goes
 * through, so a code can never load a state the game couldn't have saved.
 * Spaces and line breaks anywhere in the pasted text are ignored (chat apps
 * and notes wrap long lines).
 *
 * why: "empty" (nothing pasted) · "notACode" (not one of ours) · "damaged"
 * (cut short or changed) · "unplayable" (a real code this build can't load).
 */

import { loadSave } from "./state.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").SaveCodeResult} SaveCodeResult */

const TAG = "BRINE1";
const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** The state as a backup code. */
export function saveCode(/** @type {State} */ state) {
  const json = JSON.stringify(state);
  return `${TAG}.${toB64(new TextEncoder().encode(json))}.${check(json)}`;
}

/**
 * A pasted backup code back to a playable state, or the reason it isn't one.
 * @returns {SaveCodeResult}
 */
export function readCode(/** @type {unknown} */ text) {
  /** @type {(why: SaveCodeResult["why"]) => SaveCodeResult} */
  const no = (why) => ({ ok: false, why });
  const code = typeof text === "string" ? text.replace(/\s+/g, "") : "";
  if (!code) return no("empty");
  const parts = code.split(".");
  if (parts[0] !== TAG) return no("notACode");
  if (parts.length !== 3) return no("damaged");
  const bytes = fromB64(parts[1]);
  if (!bytes) return no("damaged");
  let json;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return no("damaged");
  }
  if (check(json) !== parts[2]) return no("damaged");
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    return no("damaged");
  }
  const state = loadSave(raw);
  return state ? { ok: true, state } : no("unplayable");
}

/** FNV-1a over the JSON text, as 6 base64url characters (36 bits of it). */
function check(/** @type {string} */ s) {
  let h = 0x811c9dc5;
  let g = 0x2545f491;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h = Math.imul(h ^ c, 0x01000193) >>> 0;
    g = Math.imul(g ^ c, 0x01000193 ^ 0x5bd1e995) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 6; i++) out += ABC[((i < 3 ? h : g) >>> ((i % 3) * 6)) & 63];
  return out;
}

function toB64(/** @type {Uint8Array} */ b) {
  let out = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    const chars = i + 2 < b.length ? 4 : i + 1 < b.length ? 3 : 2;
    for (let k = 0; k < chars; k++) out += ABC[(n >>> (18 - 6 * k)) & 63];
  }
  return out;
}

/** @returns {Uint8Array | null} */
function fromB64(/** @type {string} */ s) {
  if (s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let n = 0;
  let bits = 0;
  let o = 0;
  for (const ch of s) {
    const v = ABC.indexOf(ch);
    if (v < 0) return null;
    n = (n << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (n >>> bits) & 255;
      n &= (1 << bits) - 1;
    }
  }
  return out;
}
