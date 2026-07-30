/**
 * Minimal canvas engine: sizing, game loop, pointer input.
 *
 * Everything works in CSS pixels ("logical" coordinates). The device pixel
 * ratio is handled by the transform on the context, so a game never has to
 * think about retina scaling — but it does have to be resolution-independent,
 * since the play area is whatever the phone gives us. Lay things out relative
 * to `stage.width` / `stage.height` rather than hardcoding pixel positions.
 */

/**
 * Attach a canvas that fills its container and tracks resizes.
 * @param {HTMLElement} container
 * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, width: number, height: number, onResize: (fn: Function) => void}}
 */
export function createStage(container) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  container.appendChild(canvas);

  const resizeHandlers = [];
  const stage = {
    canvas,
    ctx,
    width: 0,
    height: 0,
    onResize(fn) {
      resizeHandlers.push(fn);
    },
  };

  function resize() {
    const rect = container.getBoundingClientRect();
    // Cap DPR at 2: 3x on a big phone screen costs a lot of fill rate for
    // detail nobody can see.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    stage.width = rect.width;
    stage.height = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const fn of resizeHandlers) fn(stage.width, stage.height);
  }

  new ResizeObserver(resize).observe(container);
  resize();

  return stage;
}

/**
 * requestAnimationFrame loop with a delta-time argument in seconds.
 * Delta is clamped so that backgrounding the tab doesn't teleport everything
 * across the screen on the first frame back.
 *
 * @param {(dt: number, elapsed: number) => void} frame
 * @returns {{stop: () => void, running: () => boolean}}
 */
export function createLoop(frame) {
  let raf = null;
  let last = 0;
  let elapsed = 0;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    elapsed += dt;
    frame(dt, elapsed);
  }

  // Kick off with a zero-length first frame so `last` is sane.
  last = performance.now();
  raf = requestAnimationFrame(tick);

  return {
    stop() {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    },
    running: () => raf !== null,
  };
}

/**
 * Pointer input for a stage. Unifies touch and mouse, reports coordinates in
 * stage-logical pixels, and derives taps and swipes.
 *
 * @param {ReturnType<typeof createStage>} stage
 * @param {{
 *   onDown?: (p: {x: number, y: number}) => void,
 *   onMove?: (p: {x: number, y: number, dx: number, dy: number}) => void,
 *   onUp?: (p: {x: number, y: number}) => void,
 *   onTap?: (p: {x: number, y: number}) => void,
 *   onSwipe?: (p: {dir: 'left'|'right'|'up'|'down', dx: number, dy: number}) => void,
 * }} handlers
 */
export function createInput(stage, handlers = {}) {
  const TAP_MAX_MS = 250;
  const TAP_MAX_DIST = 12;
  const SWIPE_MIN_DIST = 32;

  let active = null;

  const point = (e) => {
    const rect = stage.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const down = (e) => {
    // Ignore extra fingers: these games are one-pointer.
    if (active !== null) return;
    const p = point(e);
    active = { id: e.pointerId, startX: p.x, startY: p.y, x: p.x, y: p.y, t: performance.now() };
    stage.canvas.setPointerCapture(e.pointerId);
    handlers.onDown?.(p);
  };

  const move = (e) => {
    if (!active || e.pointerId !== active.id) return;
    const p = point(e);
    const dx = p.x - active.x;
    const dy = p.y - active.y;
    active.x = p.x;
    active.y = p.y;
    handlers.onMove?.({ ...p, dx, dy });
  };

  const up = (e) => {
    if (!active || e.pointerId !== active.id) return;
    const p = point(e);
    const dx = p.x - active.startX;
    const dy = p.y - active.startY;
    const dist = Math.hypot(dx, dy);
    const dur = performance.now() - active.t;
    active = null;

    handlers.onUp?.(p);
    if (dur <= TAP_MAX_MS && dist <= TAP_MAX_DIST) {
      handlers.onTap?.(p);
    } else if (dist >= SWIPE_MIN_DIST) {
      const dir =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      handlers.onSwipe?.({ dir, dx, dy });
    }
  };

  stage.canvas.addEventListener("pointerdown", down);
  stage.canvas.addEventListener("pointermove", move);
  stage.canvas.addEventListener("pointerup", up);
  stage.canvas.addEventListener("pointercancel", up);

  return {
    get pointer() {
      return active ? { x: active.x, y: active.y } : null;
    },
    destroy() {
      stage.canvas.removeEventListener("pointerdown", down);
      stage.canvas.removeEventListener("pointermove", move);
      stage.canvas.removeEventListener("pointerup", up);
      stage.canvas.removeEventListener("pointercancel", up);
    },
  };
}

/** Short haptic tap, where supported. No-op on iOS Safari. */
export function vibrate(ms = 12) {
  navigator.vibrate?.(ms);
}

export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
