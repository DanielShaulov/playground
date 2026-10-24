// @ts-check
/**
 * Bug report codes: a whole report (the note, the shop, the trail of actions,
 * recent taps and errors) as one block of plain text that fits in an email.
 *
 *   encodeReport(report) → "FERMENT-REPORT1.<z|j>.<base64url>.END", wrapped at 76
 *   decodeReport(text)   → the report object, or null
 *
 * "z" is deflate-compressed JSON (CompressionStream: iOS 16.4+, Chrome 80+,
 * Node 18+); "j" is plain JSON for a browser without it. decodeReport finds
 * the code anywhere in the text it is given (a whole pasted email is fine)
 * and ignores line breaks and spaces inside it, since mail apps re-wrap.
 * The .END mark tells a whole code from one a mail app cut short.
 *
 * No DOM here, so Node can read reports too (scripts/ferment-report.mjs).
 */

export const REPORT_TAG = "FERMENT-REPORT1";
const LINE = 76;

/** @param {unknown} report */
export async function encodeReport(report) {
  const bytes = new TextEncoder().encode(JSON.stringify(report));
  let kind = "j";
  /** @type {Uint8Array} */
  let body = bytes;
  if (typeof CompressionStream === "function") {
    try {
      body = await pipe(bytes, new CompressionStream("deflate"));
      kind = "z";
    } catch {
      body = bytes;
    }
  }
  const code = `${REPORT_TAG}.${kind}.${toB64(body)}.END`;
  return code.match(new RegExp(`.{1,${LINE}}`, "g"))?.join("\n") ?? code;
}

/** @returns {Promise<any>} */
export async function decodeReport(/** @type {unknown} */ text) {
  if (typeof text !== "string") return null;
  const at = text.indexOf(REPORT_TAG);
  if (at < 0) return null;
  // Whitespace inside the code is a mail app re-wrapping it.
  const m = text.slice(at).match(/^FERMENT-REPORT1\.\s*([zj])\.([A-Za-z0-9_\-\s]+?)\.\s*END/);
  if (!m) return null;
  const bytes = fromB64(m[2].replace(/\s+/g, ""));
  if (!bytes) return null;
  try {
    const json = m[1] === "z" ? await pipe(bytes, new DecompressionStream("deflate")) : bytes;
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json));
  } catch {
    return null;
  }
}

/** @returns {Promise<Uint8Array>} */
async function pipe(/** @type {Uint8Array} */ bytes, /** @type {any} */ stream) {
  const out = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toB64(/** @type {Uint8Array} */ b) {
  let bin = "";
  for (let i = 0; i < b.length; i += 0x8000)
    bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** @returns {Uint8Array | null} */
function fromB64(/** @type {string} */ s) {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * Replay a report's actions on its start shop with the core's step(), and
 * say whether that lands exactly on the shop the player had (`now`).
 * @param {any} report
 * @param {(s: any, a: any) => { state: any }} step
 */
export function replayReport(report, step) {
  let state = report.start;
  if (!state) return { state: null, matches: false };
  for (const action of report.actions ?? []) state = step(state, action).state;
  return { state, matches: JSON.stringify(state) === JSON.stringify(report.now) };
}
