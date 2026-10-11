// @ts-check
/** Customer art: a face from a `look` number, showing a mood. */

const SKIN = ["#f2c79b", "#e0ac7e", "#c68a5e", "#9a6440", "#f5d6bf"];
const HAIR = ["#5b3a29", "#2f2420", "#c9a063", "#8a3b22", "#9a9a9a"];
const SHIRT = ["#6aa0c8", "#c8746a", "#7fae55", "#b48ad0", "#e0b04a", "#5c8a86"];

/** mood: "wait" | "impatient" | "delight" | "ok" | "meh" */
export function faceSvg(look, mood) {
  const skin = SKIN[look % 5];
  const hair = HAIR[Math.floor(look / 5) % 5];
  const shirt = SHIRT[Math.floor(look / 25) % 6];
  const style = Math.floor(look / 150) % 3;
  const hairPath = [
    "M14 34 Q40 0 66 34 Q56 20 40 22 Q24 20 14 34",
    "M12 40 Q10 6 40 8 Q70 6 68 40 Q62 22 40 20 Q18 22 12 40",
    "M16 30 Q40 4 64 30 Q52 26 40 18 Q30 26 16 30",
  ][style];
  const mouth = {
    wait: `<path d="M33 50 Q40 55 47 50" stroke="#4a3524" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    impatient: `<path d="M33 53 L47 52" stroke="#4a3524" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M27 33 L36 36 M53 33 L44 36" stroke="#4a3524" stroke-width="2" stroke-linecap="round"/><path d="M62 26 q4 6 0 8 q-4 -2 0 -8" fill="#7cc2e8"/>`,
    delight: `<path d="M31 48 Q40 62 49 48 Z" fill="#7a3a2a"/><circle cx="26" cy="47" r="4" fill="#f29a8a" opacity=".6"/><circle cx="54" cy="47" r="4" fill="#f29a8a" opacity=".6"/>`,
    ok: `<path d="M33 51 Q40 54 47 51" stroke="#4a3524" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    meh: `<path d="M33 55 Q40 49 47 55" stroke="#4a3524" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  }[mood];
  const eyes =
    mood === "delight"
      ? `<path d="M29 41 q3 -4 6 0 M45 41 q3 -4 6 0" stroke="#4a3524" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
      : `<circle cx="32" cy="40" r="3" fill="#4a3524"/><circle cx="48" cy="40" r="3" fill="#4a3524"/>`;
  return `<svg viewBox="0 0 80 112"><path d="M6 112 Q10 74 40 72 Q70 74 74 112 Z" fill="${shirt}"/><circle cx="40" cy="40" r="26" fill="${skin}"/><path d="${hairPath}" fill="${hair}"/>${eyes}${mouth}</svg>`;
}
