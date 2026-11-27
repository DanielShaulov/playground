// @ts-check
/**
 * Honey Hollow's sounds: a wooden music box in a summer meadow.
 *
 * Nothing here is a recording. Every sound is built on the spot with the Web
 * Audio API from sine and triangle partials, filtered noise and short
 * envelopes, so there are no audio files and nothing is fetched.
 *
 *   initAudio(getSettings)   once at boot; makes no sound and no AudioContext
 *   sound(name, opts)        a one-shot: opts { gain 0..1, pitch semitones, delay s }
 *   ambience(name)           cross-fade to a looping bed; null or "none" for silence
 *   setMuted(bool)           at once; getSettings().sound is also read on every call
 *   SOUNDS, AMBIENCES        the names
 *
 * How it is put together:
 *
 * - Each sound is a function (ctx, out, t, shift) that schedules its nodes on
 *   any context, live or offline, and returns how long it rings. ONE holds the
 *   one-shots, BEDS the ambiences. renderOffline() plays the same functions
 *   through the same output chain into a buffer; audio-test.html measures
 *   every sound that way, because a headless check cannot listen.
 * - Tuned sounds share one key, D major pentatonic (D E F# A B), so whatever
 *   rings together agrees. Levels live in three tables: LEVEL (each one-shot),
 *   BED_LEVEL (each ambience) and BED_AIR (an ambience's steady layer against
 *   its passing events). Balance a sound there, not inside its builder.
 * - Output chain (rig): voices → a little room reverb → a gentle compressor →
 *   a soft limiter that cannot pass 0.8 → the mute gain. At most MAX_VOICES
 *   ring at once and one name plays at most once per GAP seconds, so a burst
 *   of calls cannot pile up.
 * - Phones: the context is made on the first real tap or key (browsers allow
 *   no sound before one), suspended while the page is hidden or muted, and
 *   resumed on the next tap. It is never closed. Ambience timers stop while
 *   nothing can be heard.
 *
 * Nothing in this file throws to its caller: a game never breaks over a sound.
 *
 * Test hook: window.__hollowAudio = { state, muted, voices, played, bed, fading, pumping }.
 */

/** @typedef {{ gain?: number, pitch?: number, delay?: number }} SoundOpts */
/** @typedef {{ pitch: number, k: number }} Shift the pitch option, in semitones and as a ratio */
/** @typedef {(ctx: BaseAudioContext, out: AudioNode, t: number, o: Shift) => number} Maker */
/** @typedef {{ sfx: GainNode, amb: GainNode, out: GainNode }} Rig */
/**
 * @typedef {object} Bed a playing ambience
 * @property {string} name
 * @property {GainNode} out
 * @property {AudioScheduledSourceNode[]} sources
 * @property {number} until events are scheduled up to this context time
 * @property {Record<string, any>} s the bed's own memory between event windows
 */

const MAX_VOICES = 12;
const GAP = 0.04; // seconds between two plays of one name
const FADE = 1.5; // ambience cross-fade, seconds
const LEAD = 0.012; // schedule this far ahead so no attack starts in the past
const SEND = 0.16; // how much of a one-shot goes to the room
const BED_SEND = 0.08;
/** Undoes the compressor's built-in make-up gain, so a quiet sound passes at its own level. */
const TRIM = 0.7;

// ---------------------------------------------------------------------------
// Pitch and chance
// ---------------------------------------------------------------------------

/** MIDI note number to Hz (69 is A4, 440 Hz). */
const hz = (/** @type {number} */ m) => 440 * 2 ** ((m - 69) / 12);

/** D major pentatonic, as MIDI numbers. */
const N = {
  Fs3: 54,
  A3: 57,
  B3: 59,
  D4: 62,
  E4: 64,
  Fs4: 66,
  A4: 69,
  B4: 71,
  D5: 74,
  E5: 76,
  Fs5: 78,
  A5: 81,
  B5: 83,
  D6: 86,
  E6: 88,
  Fs6: 90,
  A6: 93,
  B6: 95,
  D7: 98,
};
const SCALE = [N.A4, N.B4, N.D5, N.E5, N.Fs5, N.A5, N.B5, N.D6, N.E6, N.Fs6, N.A6, N.B6];

let seed = (Date.now() ^ 0x9e3779b9) | 0;
/** A small seeded generator (mulberry32), so an offline render can be repeated exactly. */
function rnd() {
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
const rr = (/** @type {number} */ a, /** @type {number} */ b) => a + (b - a) * rnd();
const clamp = (/** @type {number} */ x, /** @type {number} */ lo, /** @type {number} */ hi) =>
  Math.min(hi, Math.max(lo, x));
const num = (/** @type {any} */ x, /** @type {number} */ fallback) =>
  typeof x === "number" && Number.isFinite(x) ? x : fallback;
const has = (/** @type {object} */ obj, /** @type {string} */ key) =>
  Object.prototype.hasOwnProperty.call(obj, key);

// ---------------------------------------------------------------------------
// Raw material: noise, envelopes, partials
// ---------------------------------------------------------------------------

/** @type {WeakMap<BaseAudioContext, { white: AudioBuffer, pink: AudioBuffer }>} */
const noiseOf = new WeakMap();

/** Two seconds of white noise and three of pink, made once per context. Both loop without a seam. */
function noise(/** @type {BaseAudioContext} */ ctx) {
  let n = noiseOf.get(ctx);
  if (n) return n;
  const sr = ctx.sampleRate;
  let s = 0x2545f491;
  const r = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2147483648 - 1;
  };
  const white = ctx.createBuffer(1, Math.floor(sr * 2), sr);
  const w = white.getChannelData(0);
  for (let i = 0; i < w.length; i++) w[i] = r();
  // Pink: Paul Kellet's three-pole filter over white noise. It runs twice
  // round the buffer and keeps the second lap, so the end meets the start.
  const pink = ctx.createBuffer(1, Math.floor(sr * 3), sr);
  const p = pink.getChannelData(0);
  const src = new Float32Array(p.length);
  for (let i = 0; i < src.length; i++) src[i] = r();
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let lap = 0; lap < 2; lap++) {
    for (let i = 0; i < p.length; i++) {
      const x = src[i];
      b0 = 0.99765 * b0 + x * 0.099046;
      b1 = 0.963 * b1 + x * 0.2965164;
      b2 = 0.57 * b2 + x * 1.0526913;
      p[i] = (b0 + b1 + b2 + x * 0.1848) * 0.22;
    }
  }
  // no standing offset: a low-pass further on would pass it straight through
  let mean = 0;
  for (let i = 0; i < p.length; i++) mean += p[i];
  mean /= p.length;
  for (let i = 0; i < p.length; i++) p[i] -= mean;
  n = { white, pink };
  noiseOf.set(ctx, n);
  return n;
}

/**
 * Attack, optional hold, then a decay that is a straight line in decibels
 * (60 dB over `dec`), which is how a struck thing dies away. Returns the end.
 * @param {AudioParam} param
 * @param {number} t
 * @param {number} att
 * @param {number} peak
 * @param {number} hold
 * @param {number} dec
 */
function envelope(param, t, att, peak, hold, dec) {
  param.value = 0;
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + att);
  if (hold > 0) param.setValueAtTime(peak, t + att + hold);
  param.exponentialRampToValueAtTime(peak * 0.001, t + att + hold + dec);
  param.linearRampToValueAtTime(0, t + att + hold + dec + 0.012);
  return t + att + hold + dec + 0.02;
}

/**
 * One partial: an oscillator through its own envelope.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {number} t
 * @param {number} f Hz
 * @param {number} peak
 * @param {number} dec seconds to fall 60 dB
 * @param {{ type?: OscillatorType, att?: number, hold?: number, cents?: number,
 *   to?: number, bend?: number, bendAt?: number }} [p] `to` glides the pitch
 *   there over `bend` seconds, starting `bendAt` seconds in
 */
function tone(ctx, out, t, f, peak, dec, p = {}) {
  if (!(f > 20 && f < 9000)) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = p.type ?? "sine";
  osc.frequency.setValueAtTime(f, t);
  if (p.to) {
    const at = t + (p.bendAt ?? 0);
    if (p.bendAt) osc.frequency.setValueAtTime(f, at);
    osc.frequency.exponentialRampToValueAtTime(p.to, at + (p.bend ?? dec));
  }
  if (p.cents) osc.detune.value = p.cents;
  const end = envelope(g.gain, t, p.att ?? 0.004, peak, p.hold ?? 0, dec);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(end);
}

/**
 * A burst of filtered noise. Returns its envelope gain.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {number} t
 * @param {number} peak
 * @param {number} dec
 * @param {{ f: number, to?: number, sweep?: number, back?: number, q?: number,
 *   type?: BiquadFilterType, att?: number, hold?: number, pink?: boolean }} p the filter slides
 *   from `f` to `to` over `sweep` seconds and, if `back` is given, on to that by the end
 */
function hiss(ctx, out, t, peak, dec, p) {
  const n = noise(ctx);
  const src = ctx.createBufferSource();
  src.buffer = p.pink ? n.pink : n.white;
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = p.type ?? "bandpass";
  flt.Q.value = p.q ?? 1;
  const att = p.att ?? 0.003;
  const hold = p.hold ?? 0;
  const g = ctx.createGain();
  const end = envelope(g.gain, t, att, peak, hold, dec);
  flt.frequency.setValueAtTime(clamp(p.f, 30, 12000), t);
  if (p.to) {
    const at = t + (p.sweep ?? att + hold + dec);
    flt.frequency.exponentialRampToValueAtTime(clamp(p.to, 30, 12000), at);
    if (p.back) flt.frequency.exponentialRampToValueAtTime(clamp(p.back, 30, 12000), end);
  }
  src.connect(flt).connect(g).connect(out);
  src.start(t, rnd() * src.buffer.duration);
  src.stop(end);
  return g;
}

/** A low-pass in front of `out`, to take the edge off whatever plays through it. */
function soften(
  /** @type {BaseAudioContext} */ ctx,
  /** @type {AudioNode} */ out,
  /** @type {number} */ f,
) {
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = clamp(f, 60, 12000);
  lp.Q.value = 0.5;
  lp.connect(out);
  return lp;
}

/**
 * A gain in front of `out` that flutters between (1 - depth) and 1.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {number} t
 * @param {number} end
 * @param {number} rate Hz
 * @param {number} depth 0..1
 * @param {OscillatorType} [type]
 */
function flutter(ctx, out, t, end, rate, depth, type = "sine") {
  const g = ctx.createGain();
  g.gain.value = 1 - depth / 2;
  const lfo = ctx.createOscillator();
  lfo.type = type;
  lfo.frequency.value = rate;
  const d = ctx.createGain();
  d.gain.value = depth / 2;
  lfo.connect(d).connect(g.gain);
  lfo.start(t);
  lfo.stop(end);
  g.connect(out);
  return g;
}

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

/**
 * The game's voice: a music-box tine, or a kalimba, or a felt mallet,
 * depending on how bright and how sharp-edged it is asked to be. The
 * fundamental and a copy six cents sharp (a slow shimmer), a quiet octave and
 * twelfth that die sooner, and a tick of a high partial for the pluck itself.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {number} t
 * @param {number} m MIDI note
 * @param {{ g?: number, dec?: number, att?: number, bright?: number, tick?: number }} [p]
 */
function note(ctx, out, t, m, p = {}) {
  const f = hz(m);
  const g = p.g ?? 1;
  const dec = p.dec ?? 0.6;
  const att = p.att ?? 0.004;
  const bright = p.bright ?? 1;
  tone(ctx, out, t, f, 0.6 * g, dec, { att });
  tone(ctx, out, t, f, 0.26 * g, dec * 0.9, { att, cents: 6 });
  tone(ctx, out, t, f * 2, 0.15 * g * bright, dec * 0.55, { att });
  if (f * 3 < 5200) tone(ctx, out, t, f * 3, 0.045 * g * bright, dec * 0.3, { att });
  const tick = (p.tick ?? 1) * bright;
  if (tick > 0) tone(ctx, out, t, Math.min(f * 5.4, 4800), 0.07 * g * tick, 0.035, { att: 0.001 });
}

/**
 * A small bell: the fundamental rings longest under an octave and a bell's
 * own sour partial (2.76), which is gone almost at once.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {number} t
 * @param {number} m MIDI note
 * @param {{ g?: number, dec?: number }} [p]
 */
function bell(ctx, out, t, m, p = {}) {
  const f = hz(m);
  const g = p.g ?? 1;
  const dec = p.dec ?? 1.2;
  tone(ctx, out, t, f, 0.56 * g, dec, { att: 0.003 });
  tone(ctx, out, t, f, 0.24 * g, dec * 0.95, { att: 0.003, cents: 5 });
  if (f * 2 < 5600) tone(ctx, out, t, f * 2, 0.13 * g, dec * 0.5, { att: 0.002 });
  if (f * 2.76 < 5600) tone(ctx, out, t, f * 2.76, 0.09 * g, dec * 0.25, { att: 0.002 });
  if (f * 5.4 < 5600) tone(ctx, out, t, f * 5.4, 0.035 * g, dec * 0.1, { att: 0.001 });
}

/** Glass on glass: a high, short ring with the tiny tick of the touch. */
function clink(
  /** @type {BaseAudioContext} */ ctx,
  /** @type {AudioNode} */ out,
  /** @type {number} */ t,
  /** @type {number} */ m,
  /** @type {number} */ g,
) {
  const f = hz(m);
  tone(ctx, out, t, f, 0.5 * g, 0.3, { att: 0.001 });
  tone(ctx, out, t, f, 0.22 * g, 0.26, { att: 0.001, cents: 9 });
  if (f * 2.32 < 5600) tone(ctx, out, t, f * 2.32, 0.1 * g, 0.09, { att: 0.001 });
  hiss(ctx, out, t, 0.22 * g, 0.012, { f: Math.min(f * 1.6, 3600), q: 1.4, att: 0.0005 });
}

/**
 * Wood: a short body that drops a fifth as it lands, a triangle partial for
 * small speakers, and a puff of noise for the contact.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {number} t
 * @param {number} f the pitch the body settles on
 * @param {number} g
 * @param {number} dec
 * @param {number} [puff] how much contact noise
 * @param {number} [tri] how much of the triangle partial: more for a low knock, which a
 *   phone speaker would otherwise not carry
 */
function knock(ctx, out, t, f, g, dec, puff = 1, tri = 1) {
  tone(ctx, out, t, f * 1.5, 0.7 * g, dec, { to: f, bend: dec * 0.35, att: 0.002 });
  tone(ctx, out, t, f * 2.4, 0.2 * g * tri, dec * 0.5, { type: "triangle", att: 0.001 });
  hiss(ctx, out, t, 0.32 * g * puff, Math.min(0.03, dec * 0.4), {
    f: Math.min(f * 4, 3200),
    q: 1.2,
    att: 0.001,
  });
}

/** Paper sliding: a band of noise that moves from f0 to f1. Returns how long it lasts. */
function swish(
  /** @type {BaseAudioContext} */ ctx,
  /** @type {AudioNode} */ out,
  /** @type {number} */ t,
  /** @type {number} */ f0,
  /** @type {number} */ f1,
  /** @type {number} */ dur,
  /** @type {number} */ g,
) {
  const lp = soften(ctx, out, 3800);
  hiss(ctx, lp, t, g, dur * 0.6, { f: f0, to: f1, sweep: dur, q: 0.9, att: dur * 0.4 });
  return dur + 0.05;
}

/** One thick bubble of honey leaving the comb. */
function glug(
  /** @type {BaseAudioContext} */ ctx,
  /** @type {AudioNode} */ out,
  /** @type {number} */ t,
  /** @type {number} */ f,
  /** @type {number} */ g,
) {
  tone(ctx, out, t, f, g, 0.085, { to: f * 1.75, bend: 0.09, att: 0.014 });
  tone(ctx, out, t, f * 2, g * 0.3, 0.06, {
    to: f * 3.5,
    bend: 0.09,
    att: 0.014,
    type: "triangle",
  });
}

/** One whistled slur of a small bird, from f0 to f1. */
function chirp(
  /** @type {BaseAudioContext} */ ctx,
  /** @type {AudioNode} */ out,
  /** @type {number} */ t,
  /** @type {number} */ f0,
  /** @type {number} */ f1,
  /** @type {number} */ dur,
  /** @type {number} */ g,
) {
  tone(ctx, out, t, f0, g, dur * 0.6, { to: f1, bend: dur, att: dur * 0.4 });
}

/** A phrase of birdsong, one of three kinds, never above 4.5 kHz. Returns its length. */
function bird(
  /** @type {BaseAudioContext} */ ctx,
  /** @type {AudioNode} */ out,
  /** @type {number} */ t,
  /** @type {number} */ g,
) {
  const base = rr(2500, 3600);
  const kind = Math.floor(rnd() * 3);
  let x = t;
  if (kind === 0) {
    // "tsee tsee tsee": a few quick falling slurs
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      chirp(ctx, out, x, base * 1.25, base * 0.95, 0.07, g * rr(0.7, 1));
      x += rr(0.1, 0.14);
    }
  } else if (kind === 1) {
    // "twee-oo": up, then a longer fall
    chirp(ctx, out, x, base * 0.85, base * 1.2, 0.09, g);
    chirp(ctx, out, x + 0.13, base * 1.15, base * 0.8, 0.16, g * 0.8);
    x += 0.3;
  } else {
    // a short trill
    const n = 4 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const up = i % 2 === 0;
      chirp(ctx, out, x, base * (up ? 1 : 1.12), base * (up ? 1.12 : 1), 0.045, g * 0.8);
      x += 0.055;
    }
  }
  return x - t + 0.2;
}

/**
 * A cloud of wings: a few sawtooth voices near one pitch, each wandering, so
 * they beat against each other, under a low-pass that keeps it a hum.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out lands on this node; shape the level there
 * @param {number} t
 * @param {number} end
 * @param {number[]} pitches Hz
 * @param {number} wob how far each wanders, Hz
 * @param {[number, number]} rate how fast it wanders, Hz
 */
function wings(ctx, out, t, end, pitches, wob, rate) {
  for (const f of pitches) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rr(rate[0], rate[1]);
    const d = ctx.createGain();
    d.gain.value = wob;
    lfo.connect(d).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.value = 1 / pitches.length;
    osc.connect(g).connect(out);
    osc.start(t);
    lfo.start(t);
    osc.stop(end);
    lfo.stop(end);
  }
}

/**
 * A run of cricket chirps: each chirp is three quick pulses of one high tone.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {number} t
 * @param {number} f Hz
 * @param {number} n chirps
 * @param {number} every seconds between chirps
 * @param {number} g
 */
function cricket(ctx, out, t, f, n, every, g) {
  const osc = ctx.createOscillator();
  osc.frequency.value = f;
  const e = ctx.createGain();
  e.gain.value = 0;
  let x = t;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 3; j++) {
      const a = x + j * 0.019;
      e.gain.setValueAtTime(0, a);
      e.gain.linearRampToValueAtTime(g * (0.6 + 0.2 * j), a + 0.005);
      e.gain.linearRampToValueAtTime(0, a + 0.015);
    }
    x += every * rr(0.95, 1.05);
  }
  osc.connect(e).connect(out);
  osc.start(t);
  osc.stop(x + 0.05);
  return x - t + 0.1;
}

/** One owl's hoot: a round, breathy tone that rises a little as it starts. */
function hoot(
  /** @type {BaseAudioContext} */ ctx,
  /** @type {AudioNode} */ out,
  /** @type {number} */ t,
  /** @type {number} */ f,
  /** @type {number} */ len,
  /** @type {number} */ g,
) {
  tone(ctx, out, t, f * 0.95, g, 0.3, { att: 0.07, hold: len, to: f, bend: 0.12 });
  tone(ctx, out, t, f * 1.9, g * 0.2, 0.22, { att: 0.07, hold: len, to: f * 2, bend: 0.12 });
}

// ---------------------------------------------------------------------------
// One-shots
// ---------------------------------------------------------------------------

/** @type {Record<string, Maker>} */
const ONE = {
  // --- the interface: small, dry, quieter than anything that is a reward ---

  /** Any button: a very soft wooden tick. */
  tap(ctx, out, t, o) {
    knock(ctx, out, t, 720 * o.k * rr(0.96, 1.04), 1, 0.045);
    return 0.08;
  },
  /** A sheet sliding up. */
  open(ctx, out, t, o) {
    return swish(ctx, out, t, 650 * o.k, 2300 * o.k, 0.2, 1);
  },
  /** A sheet sliding away. */
  close(ctx, out, t, o) {
    return swish(ctx, out, t, 2100 * o.k, 600 * o.k, 0.2, 1);
  },
  /** A toast appears: one tiny note. */
  toast(ctx, out, t, o) {
    note(ctx, out, t, N.A5 + o.pitch, { dec: 0.22, bright: 0.8 });
    return 0.3;
  },
  /** A tap that cannot work: a soft low double knock, never a buzzer. */
  nope(ctx, out, t, o) {
    knock(ctx, out, t, hz(N.E4 + o.pitch), 1, 0.09, 0.5, 1.6);
    knock(ctx, out, t + 0.115, hz(N.D4 + o.pitch), 0.85, 0.1, 0.5, 1.6);
    return 0.26;
  },
  /** A paper page turning: the slide, a crackle or two, and the page landing. */
  page(ctx, out, t, o) {
    swish(ctx, out, t, 800 * o.k, 2600 * o.k, 0.17, 1);
    for (let i = 0; i < 3; i++) {
      hiss(ctx, out, t + rr(0.03, 0.15), rr(0.15, 0.3), 0.008, {
        f: rr(2000, 3000) * o.k,
        q: 2,
        att: 0.001,
      });
    }
    hiss(ctx, out, t + 0.2, 0.9, 0.06, {
      type: "lowpass",
      f: 900 * o.k,
      q: 0.5,
      att: 0.006,
      pink: true,
    });
    return 0.32;
  },
  /** A badge appears: a tiny bubble pop. */
  pop(ctx, out, t, o) {
    tone(ctx, out, t, 520 * o.k, 1, 0.07, { to: 1500 * o.k, bend: 0.035, att: 0.003 });
    return 0.1;
  },
  /** A purse clasp: a muted double tick. */
  buy(ctx, out, t, o) {
    const lp = soften(ctx, out, 2400 * o.k);
    knock(ctx, lp, t, 1250 * o.k, 0.8, 0.028);
    knock(ctx, lp, t + 0.062, 980 * o.k, 1, 0.034);
    return 0.14;
  },

  // --- work in the meadow and the workshop ---

  /** A pat of soil and a small rising pluck (a different pair each time, for the brush). */
  plant(ctx, out, t, o) {
    hiss(ctx, out, t, 1, 0.07, { type: "lowpass", f: 700 * o.k, q: 0.5, att: 0.004, pink: true });
    tone(ctx, out, t, 210 * o.k, 0.5, 0.07, { to: 140 * o.k, bend: 0.05 });
    const i = Math.floor(rnd() * 4);
    note(ctx, out, t + 0.075, SCALE[i] + o.pitch, { g: 0.45, dec: 0.2 });
    note(ctx, out, t + 0.135, SCALE[i + 2] + o.pitch, { g: 0.5, dec: 0.3 });
    return 0.5;
  },
  /** A bed dug up: a short scrape with a little grit in it. */
  dig(ctx, out, t, o) {
    const k = o.k * rr(0.92, 1.08);
    const grit = flutter(ctx, soften(ctx, out, 3400 * k), t, t + 0.2, 52, 0.6, "sawtooth");
    hiss(ctx, grit, t, 1, 0.13, { f: 1100 * k, to: 520 * k, q: 1.4, att: 0.025 });
    return 0.22;
  },
  /** A bunch picked: a snip, then stems brushing past each other. */
  pick(ctx, out, t, o) {
    const k = o.k;
    const lp = soften(ctx, out, 3400 * k);
    hiss(ctx, lp, t, 0.5, 0.014, { f: 2500 * k, q: 2, att: 0.001 });
    tone(ctx, lp, t, 2300 * k, 0.15, 0.02, { to: 1800 * k, att: 0.001 });
    hiss(ctx, lp, t + 0.04, 0.7, 0.016, { f: 2100 * k, q: 2, att: 0.001 });
    let x = t + 0.075;
    for (let i = 0; i < 4; i++) {
      hiss(ctx, lp, x, rr(0.25, 0.5), rr(0.04, 0.07), {
        f: rr(1200, 2200) * k,
        q: 0.8,
        att: 0.012,
      });
      x += rr(0.035, 0.06);
    }
    return x - t + 0.1;
  },
  /** A hive set down: a soft wooden thunk and the grass giving under it. */
  place(ctx, out, t, o) {
    const k = o.k * rr(0.98, 1.02);
    knock(ctx, out, t, hz(N.A3) * k, 1, 0.15, 0.7, 2);
    hiss(ctx, out, t + 0.012, 0.4, 0.06, {
      type: "lowpass",
      f: 600 * k,
      q: 0.5,
      att: 0.006,
      pink: true,
    });
    return 0.25;
  },
  /** Jars taken: a warm glug of honey, then a small glass clink. */
  harvest(ctx, out, t, o) {
    glug(ctx, out, t, 250 * o.k, 1);
    glug(ctx, out, t + 0.13, 290 * o.k, 0.9);
    glug(ctx, out, t + 0.245, 340 * o.k, 0.8);
    clink(ctx, out, t + 0.43, N.D7 + o.pitch, 0.8);
    return 0.85;
  },
  /** One glass clink. */
  jar(ctx, out, t, o) {
    clink(ctx, out, t, N.B6 + o.pitch, 1);
    return 0.4;
  },
  /** Something made: a wooden knock and a sparkle. */
  craft(ctx, out, t, o) {
    knock(ctx, out, t, hz(N.D4 + o.pitch), 1, 0.1);
    bell(ctx, out, t + 0.1, N.Fs6 + o.pitch, { g: 0.4, dec: 0.3 });
    bell(ctx, out, t + 0.15, N.A6 + o.pitch, { g: 0.42, dec: 0.3 });
    bell(ctx, out, t + 0.2, N.D7 + o.pitch, { g: 0.45, dec: 0.45 });
    return 0.75;
  },
  /** Wasps sent off: a quick whoosh, up and back. */
  fend(ctx, out, t, o) {
    hiss(ctx, soften(ctx, out, 3200 * o.k), t, 1, 0.18, {
      f: 500 * o.k,
      to: 1900 * o.k,
      sweep: 0.12,
      back: 700 * o.k,
      q: 1.3,
      att: 0.1,
      pink: true,
    });
    return 0.32;
  },
  /** The weather says no: one soft patter of rain. */
  rain(ctx, out, t, o) {
    const lp = soften(ctx, out, 4000 * o.k);
    hiss(ctx, lp, t, 0.3, 0.42, { f: 2000 * o.k, q: 0.5, att: 0.08 });
    for (let i = 0; i < 13; i++) drop(ctx, lp, t + rr(0, 0.45), rr(0.3, 1), o.k);
    return 0.6;
  },

  // --- coins and rewards: tuned, and the loudest things in the game ---

  /** One soft chime. */
  coin(ctx, out, t, o) {
    bell(ctx, out, t, N.D6 + o.pitch, { dec: 0.5 });
    return 0.6;
  },
  /** A little run of three to five chimes, climbing. */
  coins(ctx, out, t, o) {
    const run = [N.D6, N.E6, N.Fs6, N.A6, N.B6];
    const n = 3 + Math.floor(rnd() * 3);
    const from = Math.floor(rnd() * (run.length - n + 1));
    for (let i = 0; i < n; i++) {
      bell(ctx, out, t + i * 0.068, run[from + i] + o.pitch, {
        g: 0.8 + 0.05 * i,
        dec: i === n - 1 ? 0.5 : 0.32,
      });
    }
    return (n - 1) * 0.068 + 0.6;
  },
  /** A goal claimed: a short rising three-note phrase. */
  claim(ctx, out, t, o) {
    note(ctx, out, t, N.D5 + o.pitch, { g: 0.85, dec: 0.4 });
    note(ctx, out, t + 0.1, N.Fs5 + o.pitch, { g: 0.9, dec: 0.4 });
    note(ctx, out, t + 0.2, N.A5 + o.pitch, { dec: 0.65 });
    return 0.95;
  },
  /** Renown up: a fuller four-note phrase, the last note held over a low D. */
  tier(ctx, out, t, o) {
    const p = o.pitch;
    note(ctx, out, t, N.D5 + p, { g: 0.85, dec: 0.4 });
    note(ctx, out, t + 0.12, N.Fs5 + p, { g: 0.88, dec: 0.4 });
    note(ctx, out, t + 0.24, N.A5 + p, { g: 0.9, dec: 0.45 });
    const x = t + 0.38;
    note(ctx, out, x, N.D6 + p, { dec: 1.3 });
    bell(ctx, out, x, N.D6 + p, { g: 0.35, dec: 1.3 });
    note(ctx, out, x, N.A5 + p, { g: 0.35, dec: 1.2, tick: 0 });
    note(ctx, out, x, N.D4 + p, { g: 0.5, dec: 1.2, att: 0.02, tick: 0, bright: 1.4 });
    return 1.8;
  },
  /** A bee fact opens: a single clear bell with a long tail. */
  fact(ctx, out, t, o) {
    bell(ctx, out, t, N.A5 + o.pitch, { dec: 2 });
    note(ctx, out, t, N.A4 + o.pitch, { g: 0.2, dec: 1.2, att: 0.01, tick: 0 });
    return 2.1;
  },
  /** A regular's heart: two warm notes a third apart. */
  heart(ctx, out, t, o) {
    const p = { dec: 0.75, att: 0.008, bright: 0.6, tick: 0.5 };
    note(ctx, out, t, N.D5 + o.pitch, { ...p, g: 0.95 });
    note(ctx, out, t + 0.17, N.Fs5 + o.pitch, p);
    return 1;
  },
  /** A happy customer: a quick bright pair of notes. */
  delighted(ctx, out, t, o) {
    note(ctx, out, t, N.A5 + o.pitch, { g: 0.9, dec: 0.3, bright: 1.25 });
    note(ctx, out, t + 0.08, N.D6 + o.pitch, { dec: 0.5, bright: 1.25 });
    return 0.65;
  },
  /** A plain sale: one neutral note. */
  fine(ctx, out, t, o) {
    note(ctx, out, t, N.A4 + o.pitch, { dec: 0.4, bright: 0.9 });
    return 0.5;
  },
  /** A customer leaves with nothing: one soft note that falls a minor third. */
  pass(ctx, out, t, o) {
    const a = hz(N.A4 + o.pitch);
    const b = hz(N.Fs4 + o.pitch);
    // held while it falls, so the fall is heard and not lost in the decay
    const fall = { to: b, bendAt: 0.1, bend: 0.05, att: 0.008, hold: 0.26 };
    tone(ctx, out, t, a, 0.6, 0.42, fall);
    tone(ctx, out, t, a, 0.26, 0.4, { ...fall, cents: 6 });
    tone(ctx, out, t, a * 2, 0.09, 0.25, { ...fall, to: b * 2 });
    return 0.75;
  },
  /** A ribbon at the Honey Show: a small fanfare of six notes, still gentle. */
  ribbon(ctx, out, t, o) {
    const p = o.pitch;
    note(ctx, out, t, N.D5 + p, { g: 0.8, dec: 0.3 });
    note(ctx, out, t + 0.1, N.Fs5 + p, { g: 0.8, dec: 0.3 });
    note(ctx, out, t + 0.2, N.A5 + p, { g: 0.85, dec: 0.3 });
    note(ctx, out, t + 0.34, N.D6 + p, { g: 0.95, dec: 0.5 });
    note(ctx, out, t + 0.52, N.A5 + p, { g: 0.8, dec: 0.3 });
    const x = t + 0.64;
    note(ctx, out, x, N.D6 + p, { dec: 1.2 });
    bell(ctx, out, x, N.Fs6 + p, { g: 0.3, dec: 1 });
    note(ctx, out, x, N.A4 + p, { g: 0.35, dec: 1, att: 0.015, tick: 0 });
    return 2;
  },

  // --- the turning of the day and the year ---

  /** Morning into day: a rising three-note figure with a hint of birdsong. */
  dayStart(ctx, out, t, o) {
    note(ctx, out, t, N.A4 + o.pitch, { g: 0.9, dec: 0.5 });
    note(ctx, out, t + 0.15, N.D5 + o.pitch, { g: 0.95, dec: 0.5 });
    note(ctx, out, t + 0.3, N.Fs5 + o.pitch, { dec: 0.8 });
    chirp(ctx, out, t + 0.52, 2900 * o.k, 3700 * o.k, 0.07, 0.16);
    chirp(ctx, out, t + 0.64, 3300 * o.k, 2700 * o.k, 0.09, 0.13);
    return 1.2;
  },
  /** Day into evening: the same figure falling, a shade darker. */
  dusk(ctx, out, t, o) {
    const p = { att: 0.007, bright: 0.6 };
    note(ctx, out, t, N.Fs5 + o.pitch, { ...p, g: 0.95, dec: 0.55 });
    note(ctx, out, t + 0.17, N.D5 + o.pitch, { ...p, g: 0.95, dec: 0.55 });
    note(ctx, out, t + 0.34, N.A4 + o.pitch, { ...p, dec: 0.95 });
    return 1.4;
  },
  /** Sleep: a four-note lullaby, stepping down to rest on D. */
  sleep(ctx, out, t, o) {
    const p = { att: 0.01, bright: 0.5, tick: 0.5, dec: 0.7 };
    note(ctx, out, t, N.A5 + o.pitch, p);
    note(ctx, out, t + 0.3, N.Fs5 + o.pitch, p);
    note(ctx, out, t + 0.6, N.E5 + o.pitch, p);
    note(ctx, out, t + 0.9, N.D5 + o.pitch, { ...p, dec: 1 });
    note(ctx, out, t + 0.9, N.D4 + o.pitch, { g: 0.4, dec: 0.9, att: 0.03, tick: 0 });
    return 2;
  },
  /** A new morning: a single soft high note and a bird. */
  wake(ctx, out, t, o) {
    note(ctx, out, t, N.D6 + o.pitch, { dec: 0.6, bright: 0.8 });
    chirp(ctx, out, t + 0.16, 3000 * o.k, 3900 * o.k, 0.07, 0.2);
    chirp(ctx, out, t + 0.27, 3100 * o.k, 4000 * o.k, 0.08, 0.24);
    return 0.75;
  },
  /** The turn of a season: a slow chord spread upward over a low D. */
  season(ctx, out, t, o) {
    const p = { att: 0.012, bright: 0.8, dec: 1.45 };
    note(ctx, out, t, N.D4 + o.pitch, { ...p, bright: 1.4 });
    note(ctx, out, t + 0.17, N.A4 + o.pitch, p);
    note(ctx, out, t + 0.34, N.D5 + o.pitch, p);
    note(ctx, out, t + 0.51, N.Fs5 + o.pitch, p);
    bell(ctx, out, t + 0.51, N.Fs5 + o.pitch, { g: 0.3, dec: 1.3 });
    return 2.1;
  },

  // --- creatures ---

  /** A swarm leaves the hive: a buzz that swells for a second and settles. */
  swarm(ctx, out, t, o) {
    const end = t + 1.42;
    const k = o.k;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(500 * k, t);
    lp.frequency.exponentialRampToValueAtTime(1500 * k, t + 0.95);
    lp.frequency.exponentialRampToValueAtTime(700 * k, end);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.28, t + 0.5);
    g.gain.linearRampToValueAtTime(1, t + 0.95);
    g.gain.setTargetAtTime(0, t + 1, 0.06);
    wings(ctx, lp, t, end, [196 * k, 213 * k, 228 * k, 247 * k], 7 * k, [4, 9]);
    lp.connect(g).connect(flutter(ctx, out, t, end, 23, 0.25));
    return 1.5;
  },
  /** Wasps at a hive: a thinner, angrier buzz, and short. */
  wasps(ctx, out, t, o) {
    const end = t + 0.5;
    const k = o.k;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1500 * k;
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    envelope(g.gain, t, 0.05, 1, 0.2, 0.22);
    wings(ctx, bp, t, end, [152 * k, 163 * k], 14 * k, [11, 17]);
    bp.connect(g).connect(flutter(ctx, soften(ctx, out, 3000 * k), t, end, 31, 0.55, "triangle"));
    return 0.55;
  },
};

/** One raindrop on a leaf: a tick of noise somewhere between 1.5 and 3.2 kHz. */
function drop(
  /** @type {BaseAudioContext} */ ctx,
  /** @type {AudioNode} */ out,
  /** @type {number} */ t,
  /** @type {number} */ g,
  /** @type {number} */ k,
) {
  hiss(ctx, out, t, g, rr(0.012, 0.03), { f: rr(1500, 3200) * k, q: 4, att: 0.001 });
}

/**
 * How loud each one-shot plays (its voice gain). Builders are written at their
 * natural level; this table is the mix, set from the measurements on
 * audio-test.html: interface sounds sit under work sounds, and those under
 * rewards.
 * @type {Record<string, number>}
 */
const LEVEL = {
  tap: 0.213,
  open: 0.144,
  close: 0.121,
  toast: 0.159,
  nope: 0.185,
  page: 0.161,
  pop: 0.189,
  buy: 0.128,
  plant: 0.29,
  dig: 0.898,
  pick: 0.754,
  place: 0.616,
  harvest: 0.242,
  jar: 0.325,
  craft: 0.328,
  fend: 0.382,
  rain: 0.491,
  coin: 0.312,
  coins: 0.252,
  claim: 0.242,
  tier: 0.168,
  fact: 0.312,
  heart: 0.243,
  delighted: 0.23,
  fine: 0.42,
  pass: 0.193,
  ribbon: 0.214,
  dayStart: 0.229,
  dusk: 0.266,
  sleep: 0.18,
  wake: 0.28,
  season: 0.157,
  swarm: 0.486,
  wasps: 0.465,
};

export const SOUNDS = Object.keys(ONE);

// ---------------------------------------------------------------------------
// Ambiences
// ---------------------------------------------------------------------------

/**
 * A steady layer of filtered noise whose level (and, if asked, colour) drifts
 * slowly. Returns what must be stopped to end it.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {number} t
 * @param {{ f: number, q?: number, g: number, type?: BiquadFilterType, pink?: boolean,
 *   rate?: number, breathe?: [number, number], wander?: [number, number] }} p
 *   breathe: [Hz, share of g]; wander: [Hz, how far in Hz] on the filter
 * @returns {AudioScheduledSourceNode[]}
 */
function air(ctx, out, t, p) {
  const n = noise(ctx);
  const src = ctx.createBufferSource();
  src.buffer = p.pink ? n.pink : n.white;
  src.loop = true;
  src.playbackRate.value = p.rate ?? 1;
  const flt = ctx.createBiquadFilter();
  flt.type = p.type ?? "bandpass";
  flt.frequency.value = p.f;
  flt.Q.value = p.q ?? 0.7;
  const g = ctx.createGain();
  g.gain.value = p.g;
  src.connect(flt).connect(g).connect(out);
  src.start(t, rnd() * src.buffer.duration);
  /** @type {AudioScheduledSourceNode[]} */
  const made = [src];
  if (p.breathe) {
    made.push(drift(ctx, g.gain, t, p.breathe[0], p.g * p.breathe[1]));
    made.push(drift(ctx, g.gain, t, p.breathe[0] * 2.7, p.g * p.breathe[1] * 0.4));
  }
  if (p.wander) {
    made.push(drift(ctx, flt.frequency, t, p.wander[0], p.wander[1]));
    made.push(drift(ctx, flt.frequency, t, p.wander[0] * 1.9, p.wander[1] * 0.5));
  }
  return made;
}

/** A slow sine added to a parameter: the thing that keeps a bed from standing still. */
function drift(
  /** @type {BaseAudioContext} */ ctx,
  /** @type {AudioParam} */ param,
  /** @type {number} */ t,
  /** @type {number} */ rate,
  /** @type {number} */ depth,
) {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate * rr(0.85, 1.15);
  const d = ctx.createGain();
  d.gain.value = depth;
  lfo.connect(d).connect(param);
  lfo.start(t);
  return lfo;
}

/** The hives at work: a low hum on A that breathes. */
function hum(
  /** @type {BaseAudioContext} */ ctx,
  /** @type {AudioNode} */ out,
  /** @type {number} */ t,
  /** @type {number} */ g,
) {
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 650;
  lp.Q.value = 0.6;
  const body = ctx.createGain();
  body.gain.value = g;
  lp.connect(body).connect(out);
  /** @type {AudioScheduledSourceNode[]} */
  const made = [];
  for (const [ratio, rate] of [
    [0.985, 0.31],
    [1, 0.23],
    [1.021, 0.41],
  ]) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = hz(N.A3) * ratio;
    const third = ctx.createGain();
    third.gain.value = 1 / 3;
    osc.connect(third).connect(lp);
    osc.start(t);
    made.push(osc, drift(ctx, osc.detune, t, rate, 30));
  }
  made.push(drift(ctx, body.gain, t, 0.08, g * 0.45), drift(ctx, body.gain, t, 0.19, g * 0.2));
  return made;
}

/**
 * Give one passing event its own gain on `out`, and let go of it when it has
 * rung out, so a bed that plays for an hour holds no more nodes than one that
 * has played for a minute.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {number} t
 * @param {(g: GainNode) => number} make builds into g, returns how long it rings
 */
function spawn(ctx, out, t, make) {
  const g = ctx.createGain();
  g.connect(out);
  const ring = make(g);
  if (ctx === live) setTimeout(() => g.disconnect(), (t - ctx.currentTime + ring + 0.3) * 1000);
}

/**
 * Call `make` at irregular moments between t0 and t1. The time of the next one
 * is kept in s[key], so the spacing carries across windows.
 * @param {Record<string, any>} s
 * @param {string} key
 * @param {number} t0
 * @param {number} t1
 * @param {[number, number]} first seconds before the first, from the bed's start
 * @param {[number, number]} every seconds of quiet between one and the next
 * @param {(at: number) => number | void} make may return how long the thing it made lasts
 */
function nowAndThen(s, key, t0, t1, first, every, make) {
  let at = s[key] ?? t0 + rr(first[0], first[1]);
  if (at < t0) at = t0;
  while (at < t1) at += (make(at) || 0) + Math.max(0.05, rr(every[0], every[1]));
  s[key] = at;
}

/** Birds at their own pace, each phrase at its own distance. */
function birds(
  /** @type {BaseAudioContext} */ ctx,
  /** @type {AudioNode} */ out,
  /** @type {number} */ t0,
  /** @type {number} */ t1,
  /** @type {Record<string, any>} */ s,
  /** @type {[number, number]} */ every,
) {
  nowAndThen(s, "bird", t0, t1, [0.3, 1.5], every, (at) => {
    spawn(ctx, out, at, (g) => bird(ctx, g, at, rr(0.3, 1)));
  });
}

/** Crickets: `n` of them, each with its own pitch and tempo, chirping in runs with rests between. */
function crickets(
  /** @type {BaseAudioContext} */ ctx,
  /** @type {AudioNode} */ out,
  /** @type {number} */ t0,
  /** @type {number} */ t1,
  /** @type {Record<string, any>} */ s,
  /** @type {number} */ n,
  /** @type {[number, number]} */ rest,
) {
  for (let i = 0; i < n; i++) {
    const me = (s["who" + i] ??= { f: rr(3900, 4500), every: rr(0.42, 0.56), g: rr(0.45, 1) });
    nowAndThen(s, "cricket" + i, t0, t1, [0.1 + i * 0.4, 1 + i * 0.8], rest, (at) => {
      const chirps = 3 + Math.floor(rnd() * 7);
      spawn(ctx, out, at, (g) => cricket(ctx, g, at, me.f, chirps, me.every, me.g));
      return chirps * me.every;
    });
  }
}

/**
 * @type {Record<string, {
 *   bed: (ctx: BaseAudioContext, out: AudioNode, t: number) => AudioScheduledSourceNode[],
 *   events?: (ctx: BaseAudioContext, out: AudioNode, t0: number, t1: number, s: Record<string, any>) => void,
 * }>}
 */
const BEDS = {
  /** A few bird chirps now and then, light air. */
  morning: {
    bed: (ctx, out, t) => [
      ...air(ctx, soften(ctx, out, 3200), t, { f: 1300, q: 0.5, g: 0.5, breathe: [0.09, 0.35] }),
      ...air(ctx, out, t, { f: 450, q: 0.6, g: 1, pink: true, breathe: [0.06, 0.3], rate: 0.8 }),
    ],
    events(ctx, out, t0, t1, s) {
      birds(ctx, out, t0, t1, s, [1.1, 3.8]);
    },
  },
  /** A low soft hum of bees that breathes, sparse birds. */
  day: {
    bed: (ctx, out, t) => [
      ...hum(ctx, out, t, 1),
      ...air(ctx, out, t, { f: 900, q: 0.5, g: 0.5, pink: true, breathe: [0.07, 0.3] }),
    ],
    events(ctx, out, t0, t1, s) {
      birds(ctx, out, t0, t1, s, [3.5, 9]);
    },
  },
  /** Crickets, softly. */
  evening: {
    bed: (ctx, out, t) =>
      air(ctx, out, t, { f: 600, q: 0.5, g: 1, pink: true, breathe: [0.05, 0.3], rate: 0.7 }),
    events(ctx, out, t0, t1, s) {
      crickets(ctx, out, t0, t1, s, 3, [0.7, 3.2]);
    },
  },
  /** Deep quiet air, and now and then an owl. */
  night: {
    bed: (ctx, out, t) => [
      ...air(ctx, out, t, { type: "lowpass", f: 420, q: 0.5, g: 1, pink: true, rate: 0.6 }),
      ...air(ctx, out, t, { f: 800, q: 0.6, g: 0.4, pink: true, breathe: [0.04, 0.4] }),
    ],
    events(ctx, out, t0, t1, s) {
      nowAndThen(s, "owl", t0, t1, [2, 7], [11, 24], (at) => {
        const f = hz(N.Fs4) * rr(0.98, 1.02);
        const g = rr(0.5, 1);
        spawn(ctx, out, at, (o) => {
          const far = soften(ctx, o, 1400);
          hoot(ctx, far, at, f, 0.16, g * 0.8);
          hoot(ctx, far, at + 0.58, f, 0.42, g);
          return 1.5;
        });
      });
    },
  },
  /** Steady soft rain. */
  rain: {
    bed: (ctx, out, t) => {
      const lp = soften(ctx, out, 4200);
      return [
        ...air(ctx, lp, t, { f: 2100, q: 0.45, g: 1, breathe: [0.11, 0.25] }),
        ...air(ctx, lp, t, { type: "lowpass", f: 500, q: 0.5, g: 1.2, pink: true, rate: 0.8 }),
      ];
    },
    events(ctx, out, t0, t1, s) {
      // a sprinkle of separate drops over the wash, in half-second handfuls
      nowAndThen(s, "drops", t0, t1, [0, 0.1], [0.5, 0.5], (at) => {
        spawn(ctx, out, at, (g) => {
          for (let i = 0; i < 5; i++) drop(ctx, g, at + rr(0, 0.5), rr(0.2, 0.9), 1);
          return 0.6;
        });
      });
      // and now and then a fat one off the hive roof
      nowAndThen(s, "drip", t0, t1, [0.5, 2], [0.9, 3], (at) => {
        const f = rr(900, 1500);
        spawn(ctx, out, at, (g) => {
          tone(ctx, g, at, f, rr(0.3, 0.7), 0.05, { to: f * 0.62, bend: 0.04, att: 0.002 });
          return 0.1;
        });
      });
    },
  },
  /** Thin wind. */
  winter: {
    bed: (ctx, out, t) => [
      ...air(ctx, out, t, {
        f: 900,
        q: 3,
        g: 1,
        pink: true,
        breathe: [0.07, 0.45],
        wander: [0.11, 260],
      }),
      ...air(ctx, out, t, { f: 1700, q: 6, g: 0.3, breathe: [0.05, 0.6], wander: [0.08, 300] }),
    ],
    events(ctx, out, t0, t1, s) {
      // gusts: the same wind, leaning in for a few seconds and whistling higher
      nowAndThen(s, "gust", t0, t1, [0.5, 2.5], [3, 8], (at) => {
        const f = rr(600, 900);
        const g = rr(0.6, 1.4);
        spawn(ctx, out, at, (o) => {
          hiss(ctx, o, at, g, 2.2, {
            f,
            to: f * rr(1.5, 2),
            sweep: 1.6,
            q: 4,
            att: 1.3,
            pink: true,
          });
          return 3.6;
        });
      });
    },
  },
  /** The stall at evening: calm air, one far cricket, and a distant bell now and then. */
  stall: {
    bed: (ctx, out, t) =>
      air(ctx, out, t, { f: 700, q: 0.5, g: 1, pink: true, breathe: [0.05, 0.3], rate: 0.75 }),
    events(ctx, out, t0, t1, s) {
      crickets(ctx, out, t0, t1, s, 1, [2, 6]);
      nowAndThen(s, "bell", t0, t1, [1, 4], [7, 14], (at) => {
        const m = rnd() < 0.5 ? N.D5 : N.A4;
        const g = rr(0.6, 1);
        spawn(ctx, out, at, (o) => {
          const far = soften(ctx, o, 1600);
          bell(ctx, far, at, m, { g, dec: 2.8 });
          if (rnd() < 0.5) bell(ctx, far, at + 1.3, m, { g: g * 0.8, dec: 2.8 });
          return 4.4;
        });
      });
    },
  },
};

/**
 * How loud each bed plays. All of them sit far under the one-shots.
 * @type {Record<string, number>}
 */
const BED_LEVEL = {
  morning: 0.0429,
  day: 0.0287,
  evening: 0.0182,
  night: 0.0132,
  rain: 0.0202,
  winter: 0.0365,
  stall: 0.021,
};

/**
 * How loud a bed's steady layers (air, hum, rain, wind) are against its passing
 * events (birds, crickets, drops, gusts, the owl, the bell).
 * @type {Record<string, number>}
 */
const BED_AIR = {
  morning: 0.31,
  day: 0.485,
  evening: 0.567,
  night: 1.2,
  rain: 0.5,
  winter: 0.79,
  stall: 0.502,
};

/** The gain a bed's steady layers pass through on their way to `out`. */
function steady(
  /** @type {BaseAudioContext} */ ctx,
  /** @type {AudioNode} */ out,
  /** @type {string} */ name,
) {
  const g = ctx.createGain();
  g.gain.value = BED_AIR[name] ?? 1;
  g.connect(out);
  return g;
}

export const AMBIENCES = Object.keys(BEDS);

// ---------------------------------------------------------------------------
// The output chain
// ---------------------------------------------------------------------------

/** A small bright room that darkens as it dies: 0.9 s of shaped noise, made once per context. */
function room(/** @type {BaseAudioContext} */ ctx) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.9);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let s = 0x1234567 + ch * 7919;
    let lp = 0;
    let power = 0;
    const quiet = Math.floor(sr * 0.012);
    for (let i = quiet; i < len; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      const x = i / len;
      // one-pole low-pass closing from 5 kHz to 1.2 kHz as the tail dies
      const a = 1 - Math.exp((-2 * Math.PI * (5000 - 3800 * x)) / sr);
      lp += a * ((s >>> 0) / 2147483648 - 1 - lp);
      d[i] = lp * 10 ** (-3 * x);
      power += d[i] * d[i];
    }
    // unit energy, so the send level means the same at any sample rate
    const k = 1 / Math.sqrt(power);
    for (let i = quiet; i < len; i++) d[i] *= k;
  }
  return buf;
}

/** The limiter's curve: a straight line up to 0.4, then bending over towards 0.8 and never past it. */
function ceiling() {
  const n = 2049;
  const curve = new Float32Array(n);
  const knee = 0.4;
  const top = 0.8;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (top - knee) * Math.tanh((a - knee) / (top - knee));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/**
 * Everything between a sound and the speaker. One-shots go into `sfx`, beds
 * into `amb`; `out` is the mute gain, to be connected to the destination.
 * @param {BaseAudioContext} ctx
 * @returns {Rig}
 */
function createRig(ctx) {
  const sfx = ctx.createGain();
  const amb = ctx.createGain();
  const mix = ctx.createGain();
  const verb = ctx.createConvolver();
  verb.normalize = false;
  verb.buffer = room(ctx);
  const send = ctx.createGain();
  send.gain.value = SEND;
  const bedSend = ctx.createGain();
  bedSend.gain.value = BED_SEND;
  // Gentle: single sounds pass untouched, a pile of them is held down.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 10;
  comp.ratio.value = 6;
  comp.attack.value = 0.004;
  comp.release.value = 0.16;
  const trim = ctx.createGain();
  trim.gain.value = TRIM;
  const soft = ctx.createWaveShaper();
  soft.curve = ceiling();
  const out = ctx.createGain();
  sfx.connect(mix);
  sfx.connect(send).connect(verb);
  amb.connect(mix);
  amb.connect(bedSend).connect(verb);
  verb.connect(mix);
  mix.connect(comp).connect(trim).connect(soft).connect(out);
  return { sfx, amb, out };
}

// ---------------------------------------------------------------------------
// The live context
// ---------------------------------------------------------------------------

/** @type {AudioContext | null} the one live context; made on the first tap, never closed */
let live = null;
/** @type {Rig | null} */
let rig = null;
let broken = false; // no Web Audio here, or it failed once: stay silent
let touched = false; // the page has had a real tap or key
let muted = false;
/** @type {(() => any) | null} */
let settingsOf = null;
/** @type {boolean | undefined} the last getSettings().sound seen */
let seenSound;
let askedAt = -1e9; // when resume() was last asked for, performance.now()
let listening = false;

/** @type {{ g: GainNode, end: number, timer: any }[]} */
const voices = [];
/** @type {Map<string, number>} when each name last started, context time */
const lastAt = new Map();
/** @type {Set<string>} */
const warned = new Set();

/** @type {string | null} the bed the game asked for */
let wantBed = null;
/** @type {Bed | null} the bed playing */
let bed = null;
/** @type {Bed[]} beds fading out */
const fading = [];
/** @type {any} */
let pumpTimer = 0;
/** @type {any} */
let dozeTimer = 0;

const hook = {
  get state() {
    return live ? live.state : "none";
  },
  get muted() {
    return muted;
  },
  get voices() {
    return voices.length;
  },
  get bed() {
    return bed ? bed.name : null;
  },
  get fading() {
    return fading.length;
  },
  get pumping() {
    return !!pumpTimer;
  },
  played: 0,
};

/** Swallow a promise's rejection (resume and suspend reject when the browser says no). */
function hushed(/** @type {any} */ p) {
  if (p && typeof p.catch === "function") p.catch(() => {});
}

/**
 * Call once at boot. Makes no sound and no AudioContext: that waits for the
 * first tap or key.
 * @param {() => { sound?: boolean }} [getSettings]
 */
export function initAudio(getSettings) {
  try {
    settingsOf = typeof getSettings === "function" ? getSettings : null;
    seenSound = undefined;
    sync();
    if (listening || typeof document === "undefined") return;
    listening = true;
    /** @type {any} */ (window).__hollowAudio = hook;
    // Which event counts as "the user did something" differs: a mouse press
    // does, a finger landing does not (the lift does). Listen to them all.
    for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) {
      document.addEventListener(type, onGesture, { capture: true, passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
  } catch {
    /* no sound, then */
  }
}

function onGesture() {
  try {
    // Where the browser can tell us, wait until it agrees there was a gesture:
    // asking sooner only earns a console warning.
    const ua = /** @type {any} */ (navigator).userActivation;
    if (ua && !ua.hasBeenActive) return;
    touched = true;
    sync();
    wake();
    // The tap may be on the sound switch itself, and its handler runs after
    // this one: look at the settings again once it has.
    setTimeout(afterGesture, 0);
  } catch {
    /* no sound, then */
  }
}

function afterGesture() {
  try {
    sync();
  } catch {
    /* no sound, then */
  }
}

function onVisibility() {
  try {
    if (!live) return;
    if (document.hidden) {
      stopPump();
      dropVoices();
      hushed(live.suspend());
    } else {
      wake();
    }
  } catch {
    /* no sound, then */
  }
}

/** Read getSettings().sound, and follow it when it has changed. */
function sync() {
  if (!settingsOf) return;
  let on;
  try {
    on = settingsOf()?.sound;
  } catch {
    return;
  }
  if (typeof on !== "boolean" || on === seenSound) return;
  seenSound = on;
  mute(!on);
}

/** The live context, made on first need. Only ever reached after a gesture. */
function context() {
  if (live || broken) return live;
  const AC = window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext;
  if (!AC) {
    broken = true;
    return null;
  }
  try {
    const ctx = /** @type {AudioContext} */ (new AC({ latencyHint: "interactive" }));
    rig = createRig(ctx);
    rig.out.connect(ctx.destination);
    live = ctx;
    // iOS wants a sound started inside the gesture itself: one silent sample.
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    blip.connect(ctx.destination);
    blip.start();
    ctx.addEventListener("statechange", () => {
      try {
        tend();
      } catch {
        /* no sound, then */
      }
    });
  } catch {
    broken = true;
    live = null;
    rig = null;
  }
  return live;
}

/** Make sure the context exists and is running, if sound is wanted and allowed. */
function wake() {
  if (muted || !touched || typeof document === "undefined" || document.hidden) return;
  const ctx = context();
  if (!ctx || !rig) return;
  if (ctx.state !== "running") {
    askedAt = performance.now();
    hushed(ctx.resume());
  }
  tend();
}

/** Sound off or on, at once. */
export function setMuted(/** @type {boolean} */ m) {
  try {
    mute(!!m);
  } catch {
    /* no sound, then */
  }
}

function mute(/** @type {boolean} */ m) {
  if (m === muted) return;
  muted = m;
  clearTimeout(dozeTimer);
  if (!live || !rig) {
    if (!muted) wake();
    return;
  }
  const ctx = live;
  if (muted) {
    rig.out.gain.setTargetAtTime(0, ctx.currentTime, 0.004);
    dropVoices();
    dropBeds();
    // let the gain reach silence, then stop the audio clock altogether
    dozeTimer = setTimeout(() => {
      if (muted) hushed(ctx.suspend());
    }, 120);
  } else {
    rig.out.gain.setTargetAtTime(1, ctx.currentTime, 0.01);
    wake();
  }
}

// ---------------------------------------------------------------------------
// One-shots, live
// ---------------------------------------------------------------------------

/**
 * Play a one-shot. Unknown names are ignored, with one console.warn per name.
 * @param {string} name
 * @param {SoundOpts} [opts]
 */
export function sound(name, opts) {
  try {
    if (!has(ONE, name)) {
      warnOnce(name, "sound");
      return;
    }
    sync();
    const ctx = live;
    if (muted || !ctx || !rig) return;
    // Suspended and not about to wake (the page is hidden, or iOS took the
    // audio away): drop it, or it would all play at once on return.
    if (ctx.state !== "running" && performance.now() - askedAt > 400) return;
    const gain = clamp(num(opts?.gain, 1), 0, 1);
    if (gain <= 0) return;
    const pitch = clamp(num(opts?.pitch, 0), -24, 24);
    const delay = clamp(num(opts?.delay, 0), 0, 30);
    const t = ctx.currentTime + LEAD + delay;
    const last = lastAt.get(name);
    if (last !== undefined && Math.abs(t - last) < GAP) return;
    lastAt.set(name, t);
    while (voices.length >= MAX_VOICES) steal();
    const g = ctx.createGain();
    g.gain.value = (LEVEL[name] ?? 1) * gain;
    g.connect(rig.sfx);
    const ring = ONE[name](ctx, g, t, { pitch, k: 2 ** (pitch / 12) });
    const voice = { g, end: t + ring, timer: 0 };
    voice.timer = setTimeout(() => release(voice), (delay + ring + 0.3) * 1000);
    voices.push(voice);
    hook.played++;
  } catch {
    /* a game never breaks over a sound */
  }
}

function warnOnce(/** @type {any} */ name, /** @type {string} */ kind) {
  const key = kind + ":" + String(name);
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`audio: no ${kind} called "${String(name)}"`);
}

/** A voice has rung out: let go of its nodes. */
function release(/** @type {{ g: GainNode, end: number, timer: any }} */ voice) {
  const i = voices.indexOf(voice);
  if (i >= 0) voices.splice(i, 1);
  clearTimeout(voice.timer);
  voice.g.disconnect();
}

/** Too many voices: fade out the one nearest its end (the quietest, most likely). */
function steal() {
  let pick = 0;
  for (let i = 1; i < voices.length; i++) if (voices[i].end < voices[pick].end) pick = i;
  const [voice] = voices.splice(pick, 1);
  clearTimeout(voice.timer);
  if (live) voice.g.gain.setTargetAtTime(0, live.currentTime, 0.008);
  setTimeout(() => voice.g.disconnect(), 60);
}

function dropVoices() {
  while (voices.length) release(voices[0]);
  lastAt.clear();
}

// ---------------------------------------------------------------------------
// Ambience, live
// ---------------------------------------------------------------------------

/**
 * Cross-fade to a looping bed over about 1.5 s. null or "none" fades to silence.
 * @param {string | null} [name]
 */
export function ambience(name) {
  try {
    const want = name == null || name === "none" ? null : name;
    if (want !== null && !has(BEDS, want)) {
      warnOnce(want, "ambience");
      return;
    }
    wantBed = want;
    sync();
    tend();
  } catch {
    /* a game never breaks over a sound */
  }
}

/** Bring what is playing in line with what is wanted and what can be heard. */
function tend() {
  const ctx = live;
  const audible =
    !!ctx &&
    !!rig &&
    !muted &&
    ctx.state === "running" &&
    !(typeof document !== "undefined" && document.hidden);
  if (!ctx || !rig || !audible) {
    stopPump();
    return;
  }
  if ((bed ? bed.name : null) !== wantBed) {
    if (bed) fadeOut(bed);
    bed = wantBed ? startBed(ctx, rig, wantBed) : null;
  }
  if (bed && BEDS[bed.name].events) startPump();
  else stopPump();
}

/** @returns {Bed} */
function startBed(
  /** @type {AudioContext} */ ctx,
  /** @type {Rig} */ r,
  /** @type {string} */ name,
) {
  const t = ctx.currentTime + LEAD;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setValueAtTime(0, t);
  out.gain.setTargetAtTime(BED_LEVEL[name] ?? 1, t, FADE / 3.5);
  out.connect(r.amb);
  const sources = BEDS[name].bed(ctx, steady(ctx, out, name), t);
  return { name, out, sources, until: t, s: {} };
}

function fadeOut(/** @type {Bed} */ b) {
  if (!live) return;
  b.out.gain.setTargetAtTime(0, live.currentTime, FADE / 3.5);
  fading.push(b);
  // never more than two tails at once, however fast the game changes its mind
  while (fading.length > 2) endBed(fading[0]);
  setTimeout(() => endBed(b), (FADE + 0.2) * 1000);
}

function endBed(/** @type {Bed} */ b) {
  const i = fading.indexOf(b);
  if (i >= 0) fading.splice(i, 1);
  for (const src of b.sources) {
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
  }
  b.out.disconnect();
}

function dropBeds() {
  stopPump();
  while (fading.length) endBed(fading[0]);
  if (bed) endBed(bed);
  bed = null;
}

function startPump() {
  if (pumpTimer) return;
  pumpTimer = setInterval(pump, 400);
  pump();
}

function stopPump() {
  if (!pumpTimer) return;
  clearInterval(pumpTimer);
  pumpTimer = 0;
}

/** Schedule the bed's passing events a little over a second ahead. */
function pump() {
  try {
    const ctx = live;
    if (!ctx || !bed || ctx.state !== "running") return;
    const events = BEDS[bed.name].events;
    if (!events) return;
    const now = ctx.currentTime;
    if (bed.until < now) bed.until = now + LEAD;
    const to = now + 1.2;
    if (to > bed.until) {
      events(ctx, bed.out, bed.until, to, bed.s);
      bed.until = to;
    }
  } catch {
    /* a game never breaks over a sound */
  }
}

// ---------------------------------------------------------------------------
// Offline, for audio-test.html and the checks
// ---------------------------------------------------------------------------

/**
 * Render sounds through the same builders and the same output chain into a
 * buffer instead of the speaker. Not used by the game.
 * @param {object} what
 * @param {(string | [string, SoundOpts?])[]} [what.sounds] one-shots, all started at 0.02 s plus their delay
 * @param {string} [what.ambience] a bed, at full level from the first sample
 * @param {"all" | "air" | "events"} [what.layers] only the bed's steady layers, or only its events
 * @param {number} [what.bedGain] scales the bed (a check uses it to stay under the compressor)
 * @param {(ctx: BaseAudioContext, sfx: AudioNode, noise: { white: AudioBuffer, pink: AudioBuffer }) => void} [what.custom]
 *   anything else, into the one-shot bus; it is also handed the noise the builders use
 * @param {number} [what.seconds]
 * @param {number} [what.sampleRate]
 * @param {number} [what.seed] the same seed renders the same samples
 * @returns {Promise<AudioBuffer>}
 */
export function renderOffline(what) {
  const sr = what.sampleRate ?? 44100;
  const seconds = what.seconds ?? 3;
  const OC = window.OfflineAudioContext ?? /** @type {any} */ (window).webkitOfflineAudioContext;
  /** @type {OfflineAudioContext} */
  const ctx = new OC(2, Math.ceil(sr * seconds), sr);
  const r = createRig(ctx);
  r.out.connect(ctx.destination);
  const keep = seed;
  seed = what.seed ?? 1;
  try {
    for (const entry of what.sounds ?? []) {
      const [name, opts] = typeof entry === "string" ? [entry, undefined] : entry;
      const pitch = num(opts?.pitch, 0);
      const g = ctx.createGain();
      g.gain.value = (LEVEL[name] ?? 1) * num(opts?.gain, 1);
      g.connect(r.sfx);
      ONE[name](ctx, g, 0.02 + num(opts?.delay, 0), { pitch, k: 2 ** (pitch / 12) });
    }
    if (what.ambience) {
      const name = what.ambience;
      const layers = what.layers ?? "all";
      const out = ctx.createGain();
      out.gain.value = (BED_LEVEL[name] ?? 1) * (what.bedGain ?? 1);
      out.connect(r.amb);
      if (layers !== "events") BEDS[name].bed(ctx, steady(ctx, out, name), 0);
      if (layers !== "air") BEDS[name].events?.(ctx, out, 0, seconds, {});
    }
    what.custom?.(ctx, r.sfx, noise(ctx));
  } finally {
    seed = keep;
  }
  return ctx.startRendering();
}
