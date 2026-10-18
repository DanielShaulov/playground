// @ts-check
/**
 * The shop's sounds, as data. ui/audio.js plays them; nothing here runs.
 *
 * Each sound is one or more notes. A note is [at, zz]: `at` is seconds after
 * the sound starts, `zz` is a ZzFX parameter list (vendor/zzfx.js):
 *   [volume, randomness, frequency, attack, sustain, release, shape,
 *    shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime,
 *    noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter]
 * shape 0 sine, 1 triangle, 2 saw, 3 tan, 4 noise, 5 square. filter > 0 is a
 * high-pass at that many Hz, < 0 a low-pass.
 *
 * The palette is quiet and warm on purpose: sines and soft triangles, gentle
 * attacks, nothing buzzy. `gap` (seconds) stops one sound stacking on itself
 * when many events land in one tick. `buzz` is a navigator.vibrate pattern
 * (ms) for phones that have it.
 *
 * @typedef {[number, number[]]} Note
 * @typedef {{ notes: Note[], gap?: number, buzz?: number[] }} Sound
 */

// Notes of a warm pentatonic around C5, in Hz.
const C5 = 523.25,
  D5 = 587.33,
  E5 = 659.25,
  G5 = 783.99,
  A5 = 880,
  C6 = 1046.5,
  E6 = 1318.5,
  G6 = 1568,
  C7 = 2093;

/** A small glass bell: sine, soft start, long ring. */
const bell = (vol, hz, ring = 0.8) => [
  vol,
  0,
  hz,
  0.004,
  0,
  ring,
  0,
  1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0.6,
  0.06,
];
/** A coin clink: short bright triangle. */
const clink = (vol, hz) => [
  vol,
  0.02,
  hz,
  0,
  0.01,
  0.14,
  1,
  1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0.5,
  0.02,
];
/** A wooden knock: low triangle, muffled. */
const knock = (vol, hz) => [
  vol,
  0.05,
  hz,
  0,
  0,
  0.07,
  1,
  1.5,
  -2,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  -900,
];

/** @type {Record<string, Sound>} */
export const SOUNDS = {
  // A served jar the customer loved: two rising bells.
  delight: {
    notes: [
      [0, bell(0.45, G5)],
      [0.09, bell(0.4, C6, 1)],
    ],
    buzz: [12],
  },
  // A jar that will do: one soft bell.
  ok: { notes: [[0, bell(0.35, E5, 0.5)]] },
  // Not what they wanted: a low, muffled falling note.
  meh: {
    notes: [
      [0, [0.3, 0, 330, 0.01, 0.05, 0.3, 1, 1, -0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, -1200]],
    ],
  },
  // Coins into the till.
  coins: {
    notes: [
      [0, clink(0.18, G6)],
      [0.06, clink(0.15, C7)],
    ],
    gap: 0.15,
  },
  // Someone steps up and taps the little bell on the counter: one quiet "ting".
  // Two stacked partials (the second out of tune, like real metal) set it
  // apart from the pure serving bells.
  arrive: {
    notes: [
      [0, bell(0.14, A5 * 2, 0.9)],
      [0, bell(0.04, A5 * 2 * 2.76, 0.4)],
    ],
    gap: 0.4,
  },
  // The door bell when the shop opens: a bright double ring.
  open: {
    notes: [
      [0, bell(0.3, E6, 1.1)],
      [0.11, bell(0.26, G6, 1.1)],
      [0.24, bell(0.18, E6, 1.2)],
    ],
  },
  // The door bell when the shop closes: the same bell, falling and softer.
  close: {
    notes: [
      [0, bell(0.24, G6, 1.1)],
      [0.14, bell(0.2, E6, 1.3)],
    ],
  },
  // A lid popping off a jar that went too far: a pop and a little fizz.
  pop: {
    notes: [
      [0, [0.5, 0.1, 180, 0, 0, 0.06, 0, 1, 30, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -2500]],
      [0.03, [0.06, 0.2, 3000, 0.02, 0.05, 0.3, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2500]],
    ],
    gap: 0.3,
    buzz: [8],
  },
  // A new recipe found on the bench: a little rising run.
  discover: {
    notes: [
      [0, bell(0.3, C5, 0.6)],
      [0.08, bell(0.3, E5, 0.6)],
      [0.16, bell(0.3, G5, 0.6)],
      [0.26, bell(0.34, C6, 1.2)],
    ],
    buzz: [15, 40, 15],
  },
  // The shop moves up a tier: a warm run and a held chord.
  tierUp: {
    notes: [
      [0, bell(0.28, C5, 0.6)],
      [0.1, bell(0.28, D5, 0.6)],
      [0.2, bell(0.28, E5, 0.6)],
      [0.3, bell(0.28, G5, 0.6)],
      [0.42, bell(0.26, C6, 1.6)],
      [0.42, bell(0.2, E6, 1.6)],
      [0.42, bell(0.16, A5, 1.6)],
    ],
    buzz: [20, 60, 20],
  },
  // A crate bought at the market: a soft thud, then a coin.
  buy: {
    notes: [
      [0, knock(0.4, 130)],
      [0.07, clink(0.12, G6)],
    ],
    gap: 0.12,
  },
};
