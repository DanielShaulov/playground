// @ts-check
/**
 * Small celebrations, through `app.fx(name, opts)`:
 *
 *   app.fx("coins",   { from, to?, n? })  coins arc from a point to the coins chip
 *   app.fx("hearts",  { at, n? })         hearts drift up from a point
 *   app.fx("sparkle", { at, n? })         a few stars twinkle round a point
 *   app.fx("pop",     { el })             an element swells and settles
 *
 * `from`, `at` and `to` are an element, a selector or { x, y } in page
 * pixels. Coins fly to `to`, or else to the element marked `data-fx="coins"`
 * (the coins chip in the top bar), which gives a little pop as they land.
 *
 * Cheap on purpose: a handful of DOM nodes moved by the Web Animations API,
 * each removing itself. With reduced motion on, every effect does nothing.
 * The pictures are the painted coin and heart from ui/art/goods.js when that
 * module is in; plain CSS shapes stand in until then.
 */

import { layers, motion } from "./layers.js";
import { el, optional, centreOf } from "./dom.js";
import { url } from "./paint/sprite.js";

/** @type {null | { coin: string | null, heart: string | null }} */
let art = null;
/** @type {Promise<void> | null} */
let warming = null;

/** Paint the coin and the heart ahead of the first effect (boot calls this). */
export function warmFx() {
  warming ??= (async () => {
    const goods = await optional(new URL("./art/goods.js", import.meta.url));
    const paint = (make) => {
      try {
        const s = make();
        return s?.canvas ? url(s) : null;
      } catch {
        return null;
      }
    };
    art = {
      coin: goods?.item ? paint(() => goods.item("coin")) : null,
      heart: goods?.heart ? paint(() => goods.heart(true)) : null,
    };
  })();
  return warming;
}

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

/** One flying thing, `size` px, centred on (0, 0) of the fx layer until it is moved. */
function piece(kind, size) {
  const src = kind === "coin" ? art?.coin : kind === "heart" ? art?.heart : null;
  const style = { width: `${size}px`, height: `${size}px`, margin: `${-size / 2}px` };
  let node;
  if (src) {
    node = el("img.hh-fx", { alt: "", draggable: "false", style });
    /** @type {HTMLImageElement} */ (node).src = src;
  } else {
    node = el(`span.hh-fx.hh-fx--${kind}`, { style: { ...style, fontSize: `${size}px` } }, [
      kind === "heart" ? "♥" : kind === "spark" ? "✦" : null,
    ]);
  }
  layers.fx.append(node);
  return node;
}

/** Run keyframes on a node, then take it away. */
function play(node, frames, timing) {
  if (!node.animate) {
    node.remove();
    return null;
  }
  const anim = node.animate(frames, { fill: "both", ...timing });
  const gone = () => node.remove();
  anim.onfinish = gone;
  anim.oncancel = gone;
  return anim;
}

function pop(target) {
  const node = typeof target === "string" ? document.querySelector(target) : target;
  if (!(node instanceof Element) || !node.animate) return;
  node.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.16)" }, { transform: "scale(1)" }],
    { duration: 280, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
  );
}

function coins({ from, to, n = 5 } = /** @type {any} */ ({})) {
  const a = centreOf(from);
  if (!a) return;
  const chip = to ?? document.querySelector('[data-fx="coins"]');
  const b = centreOf(chip) ?? { x: a.x, y: a.y - 90 };
  const count = Math.max(1, Math.min(12, Math.round(n)));
  for (let i = 0; i < count; i++) {
    const node = piece("coin", 22);
    // A quadratic curve: out sideways and up, then home to the chip.
    const sx = a.x + rand(-10, 10);
    const sy = a.y + rand(-6, 6);
    const cx = (sx + b.x) / 2 + rand(-46, 46);
    const cy = Math.min(sy, b.y) - rand(24, 70);
    const frames = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const u = 1 - t;
      const x = u * u * sx + 2 * u * t * cx + t * t * b.x;
      const y = u * u * sy + 2 * u * t * cy + t * t * b.y;
      const scale = k === 0 ? 0.4 : 1 - 0.35 * t * t;
      frames.push({
        transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(2)})`,
        opacity: k === 10 ? 0.2 : 1,
      });
    }
    const anim = play(node, frames, {
      duration: 560 + rand(0, 120),
      delay: i * 70,
      easing: "ease-in-out",
    });
    if (anim && i === count - 1 && chip) anim.finished.then(() => pop(chip)).catch(() => {});
  }
}

function hearts({ at, n = 3 } = /** @type {any} */ ({})) {
  const a = centreOf(at);
  if (!a) return;
  const count = Math.max(1, Math.min(8, Math.round(n)));
  for (let i = 0; i < count; i++) {
    const node = piece("heart", 24);
    const x = a.x + rand(-18, 18);
    const drift = rand(-16, 16);
    const rise = rand(56, 92);
    const at0 = `translate(${x.toFixed(1)}px, ${a.y.toFixed(1)}px)`;
    play(
      node,
      [
        { transform: `${at0} scale(0.3)`, opacity: 0 },
        {
          transform: `translate(${(x + drift * 0.4).toFixed(1)}px, ${(a.y - rise * 0.35).toFixed(1)}px) scale(1.1)`,
          opacity: 1,
          offset: 0.3,
        },
        {
          transform: `translate(${(x + drift).toFixed(1)}px, ${(a.y - rise).toFixed(1)}px) scale(0.9)`,
          opacity: 0,
        },
      ],
      { duration: 950 + rand(0, 200), delay: i * 110, easing: "ease-out" },
    );
  }
}

function sparkle({ at, n = 5 } = /** @type {any} */ ({})) {
  const a = centreOf(at);
  if (!a) return;
  const count = Math.max(1, Math.min(10, Math.round(n)));
  for (let i = 0; i < count; i++) {
    const node = piece("spark", rand(11, 18));
    const angle = (i / count) * Math.PI * 2 + rand(-0.4, 0.4);
    const far = rand(12, 30);
    const at0 = `translate(${(a.x + Math.cos(angle) * far).toFixed(1)}px, ${(a.y + Math.sin(angle) * far).toFixed(1)}px)`;
    play(
      node,
      [
        { transform: `${at0} scale(0) rotate(0deg)`, opacity: 0 },
        { transform: `${at0} scale(1) rotate(40deg)`, opacity: 1, offset: 0.45 },
        { transform: `${at0} scale(0) rotate(90deg)`, opacity: 0 },
      ],
      { duration: 520 + rand(0, 160), delay: i * 45, easing: "ease-in-out" },
    );
  }
}

const EFFECTS = { coins, hearts, sparkle, pop: (o) => pop(o?.el) };

/**
 * @param {"coins" | "hearts" | "sparkle" | "pop"} name
 * @param {Record<string, any>} [opts]
 */
export function fx(name, opts) {
  if (motion.calm) return;
  if (!art) warmFx();
  EFFECTS[name]?.(opts);
}
