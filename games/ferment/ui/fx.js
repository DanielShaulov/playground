// @ts-check
/**
 * Motion for The Brine Nook: coins, customers, lids, brine, stamps and the
 * light of the day. Driven only by core events, through fxReact(e, ui) in
 * main.js react(), plus a watch on the counter for who is standing at it.
 *
 * Motion only decorates. It runs after the state has already changed, never
 * holds anything back, and everything it adds sits in one overlay with
 * pointer-events: none, so a tap always reaches the shop underneath. Shop
 * nodes it moves (the face at the counter, a jar on the shelf) are animated
 * with the Web Animations API, which leaves their class names alone.
 *
 * With prefers-reduced-motion nothing here runs at all (the browser tests
 * play that way, so their screenshots stay still and repeatable).
 */

import { RECIPES } from "../content/recipes.js";
import { bump } from "./dom.js";

/** Every duration (ms) and count the motion uses. */
export const FX = {
  coinFly: 640, // counter → till
  coinGap: 70, // between coins of one sale
  coinsMax: 7,
  tip: 1300, // the "+N tip" tag under the till
  walkIn: 440,
  walkOut: 340,
  departShown: 1500, // how long main.js depart() keeps a leaving customer at the counter
  pour: 560, // brine settling to its new level
  tilt: 460,
  handOver: 620, // a jar that was emptied (or taken whole) leaving the shelf
  lidPop: 950,
  burst: 700,
  shake: 360,
  overnightGap: 260, // between jars found popped in the morning
  stamp: 460,
  tierUp: 2000,
  confetti: 30,
  open: 1500,
  dusk: 950,
  dawn: 1200,
};

const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const rnd = (a, b) => a + Math.random() * (b - a);

/** @type {HTMLElement | null} */
let layer = null;
function ensure() {
  if (layer && layer.isConnected) return layer;
  layer = document.createElement("div");
  layer.className = "fx-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);
  watchCounter();
  return layer;
}
setTimeout(ensure, 0); // main.js mounts the shop right after its imports

/** Put a throwaway node in the overlay; it removes itself when its animation ends. */
function spawn(cls, x, y, html = "") {
  const el = document.createElement("div");
  el.className = "fx " + cls;
  el.style.left = x + "px";
  el.style.top = y + "px";
  if (html) el.innerHTML = html;
  ensure().appendChild(el);
  return el;
}

/** el.animate(), removing `el` afterwards when it is one of ours. */
function play(el, frames, opts) {
  const a = el.animate(frames, { fill: "both", ...opts });
  if (el.classList.contains("fx")) a.onfinish = a.oncancel = () => el.remove();
  return a;
}

const visible = (/** @type {string} */ sel) =>
  /** @type {HTMLElement | undefined} */ (
    [...document.querySelectorAll(sel)].find((el) => el.getClientRects().length)
  );
const centre = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
};
const slotEl = (i) =>
  /** @type {HTMLElement | null} */ (document.querySelector(`.slot[data-slot="${i}"]`));
/** Runs once the screen has been redrawn for the event (main.js renders right after dispatch). */
const afterRender = (fn) => queueMicrotask(() => requestAnimationFrame(fn));

// ---------- coins to the till ----------

function coinsToTill(pay, tip, from) {
  const till = visible(".pill.coins");
  if (!till || !from || pay <= 0) return;
  const a = centre(from);
  const b = centre(till);
  const n = Math.max(2, Math.min(FX.coinsMax, 2 + Math.round(pay / 6)));
  for (let k = 0; k < n; k++) {
    const x0 = a.x + rnd(-14, 14);
    const y0 = a.y + rnd(-10, 10);
    const dx = b.x - x0;
    const dy = b.y - y0;
    const coin = spawn("fx-coin", x0, y0);
    const last = k === n - 1;
    const anim = play(
      coin,
      [
        { transform: "translate(-50%,-50%) scale(.4)", opacity: 0 },
        {
          transform: `translate(-50%,-50%) translate(${rnd(-18, 18)}px,-26px) scale(1)`,
          opacity: 1,
          offset: 0.22,
        },
        {
          transform: `translate(-50%,-50%) translate(${dx * 0.75}px,${dy * 0.45}px) scale(.9)`,
          opacity: 1,
          offset: 0.7,
        },
        { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(.55)`, opacity: 0.9 },
      ],
      { duration: FX.coinFly, delay: k * FX.coinGap, easing: "cubic-bezier(.45,0,.6,1)" },
    );
    if (last)
      anim.addEventListener("finish", () => {
        bump(till);
        if (tip > 0) {
          const tag = spawn("fx-tip", b.x, b.r.bottom + 6, `+${tip} tip`);
          play(
            tag,
            [
              { transform: "translate(-50%,0) scale(.6)", opacity: 0 },
              { transform: "translate(-50%,4px) scale(1.05)", opacity: 1, offset: 0.15 },
              { transform: "translate(-50%,6px) scale(1)", opacity: 1, offset: 0.75 },
              { transform: "translate(-50%,14px) scale(1)", opacity: 0 },
            ],
            { duration: FX.tip, easing: "ease-out" },
          );
        }
      });
  }
}

// ---------- customers walking in and out ----------

let atCounter = "";
function watchCounter() {
  const counter = document.getElementById("counter");
  if (!counter) return;
  const who = () => counter.querySelector(".say small")?.textContent?.split(" · ")[0] ?? "";
  atCounter = who();
  new MutationObserver(() => {
    const now = who();
    if (now && now !== atCounter && !calm()) walkIn(counter);
    atCounter = now;
  }).observe(counter, { childList: true });
}

function walkIn(counter) {
  const face = counter.querySelector(".face");
  const talk = counter.querySelector(".talk");
  if (face)
    play(
      face,
      [
        { transform: "translateX(-56px)", opacity: 0 },
        { transform: "translateX(4px) translateY(-3px)", opacity: 1, offset: 0.7 },
        { transform: "none", opacity: 1 },
      ],
      { duration: FX.walkIn, easing: "ease-out", fill: "none" },
    );
  if (talk)
    play(
      talk,
      [
        { transform: "scale(.9)", opacity: 0, transformOrigin: "0 70%" },
        { transform: "none", opacity: 1, transformOrigin: "0 70%" },
      ],
      {
        duration: FX.walkIn * 0.7,
        delay: FX.walkIn * 0.35,
        easing: "cubic-bezier(.3,1.4,.6,1)",
        fill: "backwards",
      },
    );
}

function walkOut(name) {
  setTimeout(() => {
    const counter = document.getElementById("counter");
    if (!counter || atCounter !== name || calm()) return;
    const face = counter.querySelector(".face");
    const talk = counter.querySelector(".talk");
    const opts = {
      duration: FX.walkOut,
      easing: "ease-in",
      fill: /** @type {const} */ ("forwards"),
    };
    if (face)
      play(face, [{ transform: "none" }, { transform: "translateX(-64px)", opacity: 0 }], opts);
    if (talk) play(talk, [{ opacity: 1 }, { opacity: 0 }], opts);
  }, FX.departShown - FX.walkOut);
}

// ---------- the jar being poured from ----------

/** Brine as drawn: bottom-anchored rects and flat surface lines, read off the jar's svg. */
function brineOf(svg) {
  const rects = [...svg.querySelectorAll("rect")].map((r) => ({
    el: r,
    y: Number(r.getAttribute("y")),
    h: Number(r.getAttribute("height")),
    x: r.getAttribute("x"),
    w: r.getAttribute("width"),
  }));
  const lines = [...svg.querySelectorAll("path")]
    .map((p) => ({ el: p, m: /^M(\S+) (\S+) H(\S+)$/.exec(p.getAttribute("d") ?? "") }))
    .filter((l) => l.m)
    .map((l) => ({ el: l.el, key: l.m[1] + "|" + l.m[3], y: Number(l.m[2]) }));
  return { rects, lines };
}

function pour(slot, from) {
  const el = slotEl(slot);
  const old = el?.querySelector("svg.jar");
  if (!el || !old) return;
  const before = brineOf(old);
  const ghost = old.cloneNode(true);
  const box = old.getBoundingClientRect();
  afterRender(() => {
    const svg = /** @type {SVGSVGElement | null} */ (el.querySelector("svg.jar"));
    if (!svg || svg === old) return;
    if (!svg.querySelector("clipPath")) {
      // Emptied, or a bulk order took the whole jar: it leaves the shelf for the counter.
      const g = spawn("fx-jar", box.left, box.top);
      g.style.width = box.width + "px";
      g.style.height = box.height + "px";
      g.appendChild(ghost);
      const to = from ? centre(from) : { x: box.left + box.width / 2, y: box.top - 80 };
      play(
        g,
        [
          { transform: "none", opacity: 1 },
          { transform: "translateY(-14px) rotate(-8deg)", opacity: 1, offset: 0.3 },
          {
            transform: `translate(${to.x - box.left - box.width / 2}px,${to.y - box.top - box.height / 2}px) scale(.5) rotate(-14deg)`,
            opacity: 0,
          },
        ],
        { duration: FX.handOver, easing: "ease-in" },
      );
      return;
    }
    svg.style.transformOrigin = "50% 100%";
    play(
      svg,
      [
        { transform: "rotate(-9deg)" },
        { transform: "rotate(2deg)", offset: 0.6 },
        { transform: "none" },
      ],
      { duration: FX.tilt, easing: "ease-out", fill: "none" },
    );
    const after = brineOf(svg);
    for (const r of after.rects) {
      const was = before.rects.find(
        (o) =>
          o.x === r.x && o.w === r.w && Math.abs(o.y + o.h - (r.y + r.h)) < 0.2 && o.h > r.h + 0.2,
      );
      if (!was || r.h <= 0) continue;
      r.el.style.transformBox = "fill-box";
      r.el.style.transformOrigin = "50% 100%";
      play(r.el, [{ transform: `scaleY(${(was.h / r.h).toFixed(3)})` }, { transform: "none" }], {
        duration: FX.pour,
        easing: "cubic-bezier(.3,.7,.4,1)",
        fill: "none",
      });
    }
    for (const l of after.lines) {
      // Paired by order among lines of the same span, so the notches stay put.
      const mine = after.lines.filter((o) => o.key === l.key);
      const theirs = before.lines.filter((o) => o.key === l.key);
      const was = mine.length === theirs.length ? theirs[mine.indexOf(l)] : null;
      if (was && Math.abs(was.y - l.y) > 0.2)
        play(l.el, [{ transform: `translateY(${was.y - l.y}px)` }, { transform: "none" }], {
          duration: FX.pour,
          easing: "cubic-bezier(.3,.7,.4,1)",
          fill: "none",
        });
    }
  });
}

// ---------- a lid popping ----------

function popLid(slot, jar) {
  const el = slotEl(slot);
  const svg = el?.querySelector("svg.jar");
  if (!svg) return;
  const r = svg.getBoundingClientRect();
  const sc = Math.min(r.width / 64, r.height / 100); // the jar's viewBox, drawn bottom-centred
  const x = r.left + r.width / 2;
  const y = r.bottom - 100 * sc + 24 * sc;
  const lid = spawn("fx-lid", x, y);
  lid.style.width = 42 * sc + "px";
  lid.style.height = 13 * sc + "px";
  const side = Math.random() < 0.5 ? -1 : 1;
  play(
    lid,
    [
      { transform: "translate(-50%,-50%)", opacity: 1 },
      {
        transform: `translate(-50%,-50%) translate(${side * 14}px,-46px) rotate(${side * 160}deg)`,
        opacity: 1,
        offset: 0.4,
      },
      {
        transform: `translate(-50%,-50%) translate(${side * 26}px,10px) rotate(${side * 340}deg)`,
        opacity: 0,
      },
    ],
    { duration: FX.lidPop, easing: "cubic-bezier(.2,.8,.5,1)" },
  );
  const colour = RECIPES[jar.recipe]?.brine ?? "#e6dcc0";
  for (let k = 0; k < 9; k++) {
    const a = -Math.PI / 2 + rnd(-1.2, 1.2);
    const d = rnd(22, 46);
    const drop = spawn("fx-drop", x + rnd(-8, 8), y);
    drop.style.background = k % 3 ? colour : "#fffdf5";
    play(
      drop,
      [
        { transform: "translate(-50%,-50%) scale(.5)", opacity: 1 },
        {
          transform: `translate(-50%,-50%) translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(1)`,
          opacity: 1,
          offset: 0.55,
        },
        {
          transform: `translate(-50%,-50%) translate(${Math.cos(a) * d * 1.2}px,${Math.sin(a) * d + 26}px) scale(.6)`,
          opacity: 0,
        },
      ],
      { duration: FX.burst, delay: rnd(0, 60), easing: "ease-out" },
    );
  }
  afterRender(() => {
    const now = el.querySelector("svg.jar");
    if (now)
      play(
        now,
        [0, 3, -3, 2, -1, 0].map((px) => ({ transform: `translateX(${px}px)` })),
        { duration: FX.shake, fill: "none" },
      );
  });
}

// ---------- a portion set aside: the chip gets its face ----------

function stamp(slot, name) {
  afterRender(() => {
    const target = slotEl(slot);
    const chips = [...document.querySelectorAll(".portions i.held")].filter((c) => {
      const inSlot = c.closest(".slot");
      return c.getAttribute("title") === `For ${name}` && (!inSlot || inSlot === target);
    });
    for (const c of chips) {
      play(
        c,
        [
          { transform: "scale(2.6) rotate(-30deg)", opacity: 0 },
          { transform: "scale(.85) rotate(4deg)", opacity: 1, offset: 0.6 },
          { transform: "none", opacity: 1 },
        ],
        { duration: FX.stamp, easing: "ease-in", fill: "backwards" },
      );
      const p = centre(c);
      const ring = spawn("fx-ring", p.x, p.y);
      play(
        ring,
        [
          { transform: "translate(-50%,-50%) scale(.6)", opacity: 0 },
          { transform: "translate(-50%,-50%) scale(1)", opacity: 0.9, offset: 0.55 },
          { transform: "translate(-50%,-50%) scale(2.1)", opacity: 0 },
        ],
        { duration: FX.stamp * 1.3, easing: "ease-out" },
      );
    }
  });
}

// ---------- tier up ----------

const CONFETTI = ["#ffd36b", "#8fc77a", "#f2b84b", "#e2683f", "#8e5bb0", "#b9875a", "#fdf6ea"];
function celebrate() {
  const w = innerWidth;
  const glow = spawn("fx-glow", w / 2, innerHeight * 0.32);
  play(
    glow,
    [
      { transform: "translate(-50%,-50%) scale(.2)", opacity: 0 },
      { transform: "translate(-50%,-50%) scale(1)", opacity: 0.85, offset: 0.25 },
      { transform: "translate(-50%,-50%) scale(1.15)", opacity: 0 },
    ],
    { duration: FX.tierUp * 0.7, easing: "ease-out" },
  );
  for (let k = 0; k < FX.confetti; k++) {
    const x0 = w / 2 + rnd(-30, 30);
    const bit = spawn("fx-confetti", x0, innerHeight * 0.3);
    bit.style.background = CONFETTI[k % CONFETTI.length];
    if (k % 4 === 0) bit.style.borderRadius = "50%";
    const dx = Math.max(14, Math.min(w - 14, x0 + rnd(-0.55, 0.55) * w)) - x0; // stays on screen
    const up = rnd(80, 190);
    const spin = rnd(-720, 720);
    play(
      bit,
      [
        { transform: "translate(-50%,-50%) scale(.4)", opacity: 1 },
        {
          transform: `translate(-50%,-50%) translate(${dx * 0.6}px,${-up}px) rotate(${spin * 0.4}deg)`,
          opacity: 1,
          offset: 0.3,
        },
        {
          transform: `translate(-50%,-50%) translate(${dx}px,${innerHeight * rnd(0.35, 0.65)}px) rotate(${spin}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: FX.tierUp * rnd(0.75, 1),
        delay: rnd(0, 120),
        easing: "cubic-bezier(.2,.6,.4,1)",
      },
    );
  }
}

// ---------- the light of the day ----------

function wash(cls, frames, duration) {
  const el = spawn("fx-wash " + cls, 0, 0);
  play(el, frames, { duration, easing: "ease-in-out" });
}

function openSign() {
  wash("warm", [{ opacity: 0 }, { opacity: 0.45, offset: 0.25 }, { opacity: 0 }], FX.open);
  const counter = document.getElementById("counter");
  const top = counter ? counter.getBoundingClientRect().top : 80;
  const sign = spawn("fx-sign", innerWidth / 2, top - 4, "<b>Open</b>");
  play(
    sign,
    [
      { transform: "translate(-50%,-30px) rotate(-24deg)", opacity: 0 },
      { transform: "translate(-50%,0) rotate(9deg)", opacity: 1, offset: 0.22 },
      { transform: "translate(-50%,0) rotate(-4deg)", opacity: 1, offset: 0.38 },
      { transform: "translate(-50%,0) rotate(0)", opacity: 1, offset: 0.75 },
      { transform: "translate(-50%,-16px) rotate(0)", opacity: 0 },
    ],
    { duration: FX.open, easing: "ease-out" },
  );
}

function dusk() {
  wash("night", [{ opacity: 0 }, { opacity: 0.72, offset: 0.35 }, { opacity: 0 }], FX.dusk);
  afterRender(() => {
    const eve = visible(".evening");
    if (eve)
      play(
        eve,
        [
          { opacity: 0, transform: "translateY(36px)" },
          { opacity: 0, transform: "translateY(36px)", offset: 0.35 },
          { opacity: 1, transform: "none" },
        ],
        { duration: FX.dusk, easing: "ease-out", fill: "none" },
      );
  });
}

function dawn(popped, ui) {
  wash("night", [{ opacity: 0.85 }, { opacity: 0 }], FX.dawn);
  wash("sunrise", [{ opacity: 0 }, { opacity: 0.6, offset: 0.45 }, { opacity: 0 }], FX.dawn * 1.4);
  popped.forEach((jar, k) =>
    setTimeout(
      () => {
        const i = ui.s.shelf.slots.findIndex((j) => j?.id === jar.id);
        if (i >= 0 && !calm()) popLid(i, jar);
      },
      FX.dawn * 0.6 + k * FX.overnightGap,
    ),
  );
}

// ---------- events ----------

/** React to one core event with motion. `ui` is main.js's screen state. */
export function fxReact(e, ui) {
  if (calm() || typeof document === "undefined") return;
  ensure();
  switch (e.type) {
    case "served":
      coinsToTill(e.pay, e.tip, visible(".counter .face") ?? slotEl(e.slot));
      pour(e.slot, visible(".counter .face"));
      walkOut(e.customer.name);
      break;
    case "delivered":
      coinsToTill(e.pay, e.tip * e.jar.servings, visible(".counter .face") ?? slotEl(e.slot));
      pour(e.slot, visible(".counter .face"));
      break;
    case "left":
      if (e.why === "impatient" || e.why === "sent") walkOut(e.customer.name);
      break;
    case "preordered":
      walkOut(e.customer.name);
      break;
    case "popped": {
      const i = ui.s.shelf.slots.findIndex((j) => j?.id === e.jar.id);
      if (i >= 0) popLid(i, e.jar);
      break;
    }
    case "held":
    case "startedForOrder":
      stamp(e.slot, e.order.name);
      break;
    case "tierUp":
      celebrate();
      break;
    case "opened":
      openSign();
      break;
    case "closed":
      dusk();
      break;
    case "slept":
      dawn(e.popped, ui);
      break;
  }
}
