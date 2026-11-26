/**
 * Procedural Web Audio synthesizer for Broadside!.
 * Rolling black-powder cannon volleys, oak-splinter raking crits, chain-shot
 * whistles, brass boarding bells, wind gusts, and Dorian sea-shanty chords.
 */

export function createAudio(initialMuted = false) {
  let ctx = null;
  let muted = Boolean(initialMuted);
  let noiseBuf = null;

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      // Pre-bake 0.5s white noise buffer for cannon & surf bursts
      const len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }

  function tone(freq, dur = 0.14, type = "triangle", gain = 0.09, slideTo = null, delay = 0) {
    if (muted || !ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(24, freq), t);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, slideTo), t + dur);
    }
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.015);
  }

  function burst(dur = 0.2, gain = 0.14, filterType = "lowpass", freq = 950, delay = 0) {
    if (muted || !ctx || !noiseBuf) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.setValueAtTime(freq, t);
    if (filterType === "lowpass") {
      flt.frequency.exponentialRampToValueAtTime(220, t + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.01);
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    setMuted(v) {
      muted = Boolean(v);
      return muted;
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },

    click() {
      tone(680, 0.045, "triangle", 0.06, 460);
    },

    ammoSwitch(ammo) {
      if (ammo === "chain") {
        tone(820, 0.08, "sine", 0.08, 1180);
        tone(1080, 0.07, "triangle", 0.06, 740, 0.04);
      } else if (ammo === "fire") {
        burst(0.11, 0.09, "bandpass", 1400);
        tone(420, 0.1, "sawtooth", 0.06, 660);
      } else {
        tone(340, 0.08, "triangle", 0.09, 210);
      }
    },

    broadside(ammo = "round") {
      // Staggered rolling gun-deck thunder
      burst(0.24, 0.18, "lowpass", 1100, 0);
      tone(135, 0.2, "sawtooth", 0.13, 38, 0);
      burst(0.18, 0.12, "lowpass", 950, 0.055);
      if (ammo === "chain") {
        tone(960, 0.14, "sine", 0.05, 580, 0.03);
      } else if (ammo === "fire") {
        burst(0.2, 0.1, "bandpass", 1650, 0.03);
      }
    },

    hit(armored = false) {
      if (armored) {
        tone(920, 0.09, "square", 0.08, 480);
        tone(1380, 0.12, "triangle", 0.07, 690, 0.02);
      } else {
        burst(0.08, 0.09, "lowpass", 720);
        tone(190, 0.07, "triangle", 0.07, 95);
      }
    },

    clang() {
      tone(1040, 0.11, "square", 0.08, 560);
      tone(1560, 0.14, "triangle", 0.07, 780, 0.02);
    },

    enemyVolley() {
      burst(0.15, 0.1, "lowpass", 680);
      tone(110, 0.14, "sawtooth", 0.07, 45);
    },

    rakeCrit() {
      burst(0.16, 0.15, "bandpass", 1250);
      tone(293.66, 0.14, "triangle", 0.1, 440, 0);
      tone(587.33, 0.2, "triangle", 0.1, 880, 0.045);
    },

    kegBoom() {
      burst(0.38, 0.24, "lowpass", 820);
      tone(98, 0.34, "sawtooth", 0.16, 28);
    },

    board() {
      // Ship's brass bell + cutlass clash + coin cascade
      tone(880, 0.28, "triangle", 0.1);
      tone(1318.5, 0.34, "sine", 0.08, null, 0.03);
      tone(1174.7, 0.22, "triangle", 0.08, 1568, 0.11);
    },

    surge() {
      burst(0.22, 0.1, "bandpass", 920);
      tone(260, 0.18, "sine", 0.07, 520);
    },

    playerHit() {
      burst(0.16, 0.15, "lowpass", 580);
      tone(125, 0.18, "sawtooth", 0.11, 52);
    },

    loot() {
      tone(1046.5, 0.08, "sine", 0.07, 1318.5);
    },

    sink(boss = false) {
      burst(0.28, 0.14, "lowpass", 620);
      const notes = boss ? [293.66, 349.23, 440, 587.33] : [392, 493.88, 587.33];
      notes.forEach((n, i) => tone(n, 0.24, "triangle", 0.08, null, i * 0.055));
    },

    victoryFanfare() {
      const shanty = [293.66, 440, 523.25, 587.33, 880];
      shanty.forEach((n, i) => tone(n, 0.3, "triangle", 0.09, null, i * 0.065));
    },
  };
}
