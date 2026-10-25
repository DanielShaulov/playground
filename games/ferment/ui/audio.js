// @ts-check
/**
 * Sound and haptics. Game events from step() become short synthesised sounds
 * (content/sounds.js, built by vendor/zzfx.js) and, on phones that support it,
 * a light buzz. main.js calls audioReact(e) for every event; the Sound switch
 * in the settings sheet (ui/settings.js) calls setMuted.
 *
 * Browsers (iOS above all) only let a page make sound after a tap, so the
 * AudioContext is created on the first tap while sound is on, never before.
 * Until then, and while muted, audioReact does nothing at all.
 *
 * Haptics use navigator.vibrate, which Android browsers have and iOS Safari
 * does not; where it is missing the buzz is simply skipped. Muting silences
 * both. The setting lives in createStore("ferment") under "audio", apart from
 * the save, so starting over keeps it.
 *
 * Test hook: window.__fermentAudio = { muted, played } (played counts sounds).
 */

import { createStore } from "../../../shared/storage.js";
import { ZZFX } from "../vendor/zzfx.js";
import { SOUNDS } from "../content/sounds.js";

const store = createStore("ferment");
const VOLUME = 0.5; // master level over every sound
let muted = !!store.get("audio", {})?.muted;
/** @type {AudioContext | null} */
let ctx = null;
/** @type {GainNode | null} */
let master = null;
/** @type {Record<string, AudioBuffer[]>} built once per sound, ahead of time (warm) or on first play */
const buffers = {};
/** @type {Record<string, number>} last start time per sound, for `gap` */
const lastAt = {};
const hook = {
  get muted() {
    return muted;
  },
  played: 0,
};
/** @type {any} */ (window).__fermentAudio = hook;

/** Sound on or off, for the settings sheet. */
export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  store.set("audio", { muted });
  if (muted) ctx?.suspend();
  else unlock();
}

/** Create or wake the AudioContext. Only ever called from inside a tap. */
function unlock() {
  if (muted) return;
  const AC = window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);
    // iOS wants a sound started inside the gesture itself: a silent blip.
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    blip.connect(master);
    blip.start();
    warm();
  }
  if (ctx.state !== "running") ctx.resume().catch(() => {});
}

// Any tap may be the first; iOS counts touchend and click, not touchstart.
for (const type of ["pointerup", "touchend", "click"])
  document.addEventListener(type, unlock, { capture: true, passive: true });
document.addEventListener("visibilitychange", () => {
  if (!ctx || muted) return;
  if (document.hidden) ctx.suspend();
  else ctx.resume().catch(() => {});
});

/** Play one sound by id, `after` seconds from now, if sound is on and unlocked. */
export function play(id, after = 0) {
  const sound = SOUNDS[id];
  if (muted || !sound) return;
  buzz(sound.buzz);
  if (!ctx || !master || ctx.state === "closed") return;
  const now = ctx.currentTime + after;
  if (now - (lastAt[id] ?? -9) < (sound.gap ?? 0.05)) return;
  lastAt[id] = now;
  const built = build(id);
  sound.notes.forEach(([at], i) => {
    const src = ctx.createBufferSource();
    src.buffer = built[i];
    src.connect(master);
    src.start(now + at);
  });
  hook.played++;
}

/** A sound's notes as audio buffers, synthesised the first time they're needed. */
function build(/** @type {string} */ id) {
  const c = /** @type {AudioContext} */ (ctx);
  return (buffers[id] ??= SOUNDS[id].notes.map(([, zz]) => {
    const samples = ZZFX.buildSamples(...zz);
    const b = c.createBuffer(1, Math.max(1, samples.length), ZZFX.sampleRate);
    b.getChannelData(0).set(samples);
    return b;
  }));
}

/**
 * Synthesise every sound in the background, one per pause, once sound is
 * unlocked. Built on first play instead, the closing bell alone cost a slow
 * phone ~60 ms inside the tap that closes the shop (release check).
 */
function warm() {
  const ids = Object.keys(SOUNDS);
  const next = () => {
    const id = ids.shift();
    if (!id || !ctx) return;
    build(id);
    setTimeout(next, 30);
  };
  setTimeout(next, 30);
}

function buzz(pattern) {
  if (!pattern || typeof navigator.vibrate !== "function") return;
  // Chrome refuses (and complains) before the page has had a tap.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* no haptics here */
  }
}

/** React to one step() event with a sound. */
export function audioReact(e) {
  if (muted) return;
  switch (e.type) {
    case "served":
    case "delivered":
      play(e.mood === "delight" ? "delight" : e.mood === "ok" ? "ok" : "meh");
      if (e.pay > 0) play("coins", 0.18);
      break;
    case "claimedGoal":
      play("coins");
      break;
    case "arrived":
      play("arrive");
      break;
    case "opened":
      play("open");
      break;
    case "closed":
      play("close");
      break;
    case "popped":
      play("pop");
      break;
    case "discovered":
      play("discover");
      break;
    case "tierUp":
    case "claimedPride":
      play("tierUp");
      break;
    case "boughtDecor":
    case "bought":
      play("buy");
      break;
  }
}
