// Shared helpers for the Ferment core tests: scripted bots and a game runner.
// A bot is (state, memo) => action; the runner feeds actions through step()
// and records them, so any bot game can be saved as a replay.
import * as C from "../../../games/ferment/core/index.js";
import { RECIPES } from "../../../games/ferment/content/recipes.js";

/** Steps per bot tick: 6 × 1/120 h = 0.05 h, the same rhythm the demo's test bot used. */
export const BOT_TICK = 6;

/** Best-paying jar for the customer at the counter, or -1. */
export function bestJar(s, c) {
  let best = -1,
    bestPay = 0;
  s.shelf.slots.forEach((j, i) => {
    if (!j || j.recipe !== c.recipe || C.isOver(j)) return;
    const v = C.judge(c, C.flavour(j));
    if (v.pay > bestPay) ((best = i), (bestPay = v.pay));
  });
  return best;
}

/** Morning restock shared by the bots: tip out popped jars, fill gaps with a rotating recipe. */
function restock(s) {
  for (let i = 0; i < s.shelf.slots.length; i++) {
    const j = s.shelf.slots[i];
    if (j && C.isOver(j)) return { type: "tipOut", slot: i };
  }
  const bases = C.menu(s).filter((id) => !RECIPES[id].base);
  for (let i = 0; i < s.shelf.slots.length; i++) {
    const recipe = bases[(i + s.clock.day) % bases.length];
    if (!s.shelf.slots[i] && s.shop.coins >= RECIPES[recipe].cost)
      return { type: "brew", slot: i, recipe };
  }
  return null;
}

export const BOTS = {
  /** Serves the best-paying jar, pre-orders when nothing fits, restocks every morning, takes bulk orders. */
  careful(s) {
    const offer = s.orders.offers[0];
    if (s.clock.phase === "morning" && offer) return { type: "acceptOrder", orderId: offer.id };
    if (s.clock.phase === "morning") return restock(s) ?? { type: "open" };
    if (s.clock.phase === "evening") return { type: "sleep" };
    const c = s.customers.queue[0];
    if (!c) return { type: "tick", n: BOT_TICK };
    const best = bestJar(s, c);
    if (best >= 0) return { type: "serve", slot: best };
    return c.orderId ? { type: "sendAway" } : { type: "preorder" };
  },
  /** Serves the first jar of the right recipe whatever its flavour; never pre-orders. */
  careless(s) {
    if (s.clock.phase === "morning") return restock(s) ?? { type: "open" };
    if (s.clock.phase === "evening") return { type: "sleep" };
    const c = s.customers.queue[0];
    if (!c) return { type: "tick", n: BOT_TICK };
    const i = s.shelf.slots.findIndex((j) => j && j.recipe === c.recipe && !C.isOver(j));
    return i >= 0 ? { type: "serve", slot: i } : { type: "sendAway" };
  },
  /** Opens the shop and ignores everyone. */
  idle(s) {
    if (s.clock.phase === "morning") return { type: "open" };
    if (s.clock.phase === "evening") return { type: "sleep" };
    return { type: "tick", n: BOT_TICK };
  },
};

/**
 * Play `bot` from newGame(seed) until `days` days have been slept through.
 * Returns the end state, the action list, and every event.
 */
export function playBot(bot, seed, days, onStep) {
  let s = C.newGame(seed);
  const actions = [];
  const events = [];
  for (let guard = 0; s.clock.day <= days; guard++) {
    if (guard > 200000) throw new Error("bot stuck");
    const action = bot(s);
    const r = C.step(s, action);
    if (r.events[0]?.type === "rejected")
      throw new Error(`bot action rejected: ${JSON.stringify(r.events[0])}`);
    onStep?.(s, action, r);
    actions.push(action);
    events.push(...r.events);
    s = r.state;
  }
  return { state: s, actions, events };
}

/** Replay an action list from a seed. Throws if any action is rejected. */
export function replay(seed, actions) {
  let s = C.newGame(seed);
  const events = [];
  for (const a of actions) {
    const r = C.step(s, a);
    if (r.events[0]?.type === "rejected")
      throw new Error(`replay rejected ${JSON.stringify(a)}: ${r.events[0].why}`);
    events.push(...r.events);
    s = r.state;
  }
  return { state: s, events };
}

/** Small seeded generator for tests (mulberry32), separate from the game's streams. */
export function testRng(seed) {
  let x = seed | 0;
  return () => {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), x | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
