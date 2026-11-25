/**
 * Procedural Web Audio synthesizer for Perihelion.
 * Zero external audio assets — pure oscillators, filtered noise, and harmonic
 * pentatonic chimes unlocked safely on the player's first gesture.
 */

// D-major pentatonic frequencies spanning 2+ octaves for shimmering combos
const PENTATONIC = [
  587.33, 659.25, 739.99, 880.0, 987.77,
  1174.66, 1318.51, 1479.98, 1760.0, 1975.53, 2349.32,
];

export function createAudio(initialMuted = false) {
  let ctx = null;
  let muted = Boolean(initialMuted);
  let noiseBuf = null;

  function ensure() {
    if (muted) return null;
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    if (!noiseBuf && ctx) {
      const len = Math.floor(ctx.sampleRate * 0.35);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return ctx;
  }

  function tone(freq, dur, { type = "sine", gain = 0.14, freqEnd = null, delay = 0 } = {}) {
    const c = ensure();
    if (!c) return;
    const now = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + dur);
    }
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function noise(dur, { filterFreq = 1200, q = 1.2, gain = 0.12, delay = 0 } = {}) {
    const c = ensure();
    if (!c || !noiseBuf) return;
    const now = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const flt = c.createBiquadFilter();
    flt.type = "bandpass";
    flt.frequency.setValueAtTime(filterFreq, now);
    flt.Q.setValueAtTime(q, now);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(c.destination);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  return {
    unlock() {
      ensure();
    },

    get muted() {
      return muted;
    },

    setMuted(v) {
      muted = Boolean(v);
    },

    playLaunch(power = 0.6) {
      tone(130 + power * 70, 0.22, { type: "triangle", gain: 0.16, freqEnd: 55 });
      noise(0.18, { filterFreq: 700 + power * 1100, q: 1.5, gain: 0.11 });
    },

    playCrystal(chain = 1, isKey = false) {
      const idx = Math.min(PENTATONIC.length - 1, Math.max(0, chain - 1));
      const f = PENTATONIC[idx];
      tone(f, isKey ? 0.42 : 0.26, { type: "sine", gain: 0.13 });
      tone(f * 2, isKey ? 0.3 : 0.16, { type: "triangle", gain: 0.045 });
      if (isKey) {
        tone(f * 1.5, 0.36, { type: "sine", gain: 0.09, delay: 0.04 });
      }
    },

    playGateUnlock() {
      tone(587.33, 0.22, { type: "triangle", gain: 0.11, delay: 0 });
      tone(880.0, 0.26, { type: "triangle", gain: 0.12, delay: 0.07 });
      tone(1174.66, 0.45, { type: "sine", gain: 0.14, delay: 0.14 });
    },

    playGraze(isSingularity = false) {
      const base = isSingularity ? 739.99 : 659.25;
      tone(base, 0.28, { type: "sine", gain: 0.11, freqEnd: base * 1.25 });
      tone(base * 1.5, 0.32, { type: "triangle", gain: 0.07, delay: 0.03 });
    },

    playBumper() {
      tone(440, 0.18, { type: "triangle", gain: 0.14, freqEnd: 660 });
      tone(880, 0.12, { type: "sine", gain: 0.07 });
    },

    playWormhole() {
      tone(320, 0.32, { type: "sine", gain: 0.12, freqEnd: 960 });
      tone(640, 0.26, { type: "triangle", gain: 0.07, freqEnd: 420, delay: 0.04 });
    },

    playTetherLock() {
      tone(392, 0.14, { type: "sine", gain: 0.09, freqEnd: 523.25 });
    },

    playTetherRelease(charge = 0.5) {
      const top = 520 + charge * 560;
      tone(240, 0.22, { type: "triangle", gain: 0.13, freqEnd: top });
      noise(0.14, { filterFreq: 1400 + charge * 1200, q: 2, gain: 0.08 });
    },

    playAegis() {
      tone(523.25, 0.25, { type: "triangle", gain: 0.13, freqEnd: 392 });
      tone(783.99, 0.28, { type: "sine", gain: 0.08, delay: 0.02 });
    },

    playLockedBounce() {
      tone(210, 0.14, { type: "triangle", gain: 0.11, freqEnd: 145 });
    },

    playCrash() {
      tone(125, 0.34, { type: "sawtooth", gain: 0.12, freqEnd: 38 });
      noise(0.24, { filterFreq: 380, q: 0.8, gain: 0.13 });
    },

    playWarp() {
      const notes = [293.66, 440.0, 554.37, 659.25, 880.0];
      notes.forEach((f, i) => {
        tone(f, 0.65, { type: i < 2 ? "triangle" : "sine", gain: 0.085, delay: i * 0.045 });
      });
    },

    playDraft() {
      tone(587.33, 0.16, { type: "sine", gain: 0.1 });
      tone(880.0, 0.24, { type: "sine", gain: 0.11, delay: 0.05 });
    },

    playStars(count = 1) {
      const notes = [587.33, 880.0, 1174.66];
      for (let i = 0; i < Math.min(3, count); i++) {
        tone(notes[i], 0.36, { type: "sine", gain: 0.11, delay: i * 0.11 });
        tone(notes[i] * 2, 0.22, { type: "triangle", gain: 0.04, delay: i * 0.11 });
      }
    },
  };
}
