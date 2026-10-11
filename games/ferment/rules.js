/**
 * The Brine Nook — game rules. Pure: no DOM, no clock, no Math.random.
 *
 * Everything the game knows lives in one plain JSON state object, so it can be
 * saved to localStorage as-is, seeded by tests, and stepped in Node. All
 * randomness comes from a seeded generator stored in `state.seed`.
 *
 * Time is in in-game hours. A day is 24h of jar ageing: the shop is open for
 * OPEN_HOURS (the only part that runs in real time), and the rest passes
 * overnight when the player sleeps. A jar's flavour is just age / recipe.hours,
 * a number from 0 (crisp) to 1 (funky); at 1 the lid pops and it can't be sold.
 *
 * Demo scope: one shop day of the core loop, repeatable. No bench, no market.
 */

export const RECIPES = {
  dill: { name: "Dill pickles", hours: 48, price: 12, cost: 7, brine: "#cfe0a8", bits: "#6f9f48" },
  hotsauce: { name: "Hot sauce", hours: 36, price: 15, cost: 9, brine: "#e9846c", bits: "#c43b2b" },
  kimchi: { name: "Kimchi", hours: 72, price: 18, cost: 11, brine: "#f0a58a", bits: "#d9573b" },
  kraut: { name: "Sauerkraut", hours: 120, price: 22, cost: 12, brine: "#f1ead0", bits: "#d2bf63" },
};
export const RECIPE_IDS = Object.keys(RECIPES);

export const BANDS = [
  { id: "crisp", lo: 0, hi: 0.3 },
  { id: "tangy", lo: 0.3, hi: 0.55 },
  { id: "sour", lo: 0.55, hi: 0.8 },
  { id: "funky", lo: 0.8, hi: 1 },
];

export const SLOTS = 9;
export const SERVINGS = 2;
export const OPEN_AT = 8; // shop opens 08:00
export const OPEN_HOURS = 12; // and closes 20:00
export const HOUR_SECONDS = 12.5; // real seconds per in-game hour while open
export const PATIENCE = 2.2; // hours a customer waits at the counter
export const WINDOW = 0.16; // width of a customer's flavour window
export const MAX_QUEUE = 3;
export const REP_MAX = 10;

const NAMES = [
  "Mrs. Okafor",
  "Theo",
  "Priya",
  "Mr. Lindqvist",
  "Ama",
  "Jonas",
  "Rosa",
  "Kenji",
  "Old Bram",
  "Lea",
  "Dmitri",
  "Noor",
  "Felix",
  "Hana",
  "Marisol",
  "Ezra",
];

// ---------- randomness ----------

export function random(s) {
  s.seed = (s.seed + 0x6d2b79f5) | 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (s, a, b) => a + random(s) * (b - a);
const pick = (s, list) => list[Math.floor(random(s) * list.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- reading jars ----------

export const flavour = (jar) => clamp(jar.age / RECIPES[jar.recipe].hours, 0, 1);
export const isOver = (jar) => jar.age >= RECIPES[jar.recipe].hours;
export const bandOf = (x) => BANDS.find((b) => x < b.hi) ?? BANDS[BANDS.length - 1];

/** Where a jar of `recipe` started now will sit after `hours` more hours. */
export const forecast = (recipe, hours) => hours / RECIPES[recipe].hours;

/** How a customer feels about a jar at flavour `f`, and what they pay. */
export function judge(cust, f) {
  const price = RECIPES[cust.recipe].price;
  const dist = f < cust.lo ? cust.lo - f : f > cust.hi ? f - cust.hi : 0;
  const bonus = cust.orderId ? 1.25 : 1;
  if (dist === 0) {
    const mid = (cust.lo + cust.hi) / 2;
    const centrality = 1 - Math.abs(f - mid) / ((cust.hi - cust.lo) / 2);
    const tip = Math.round(price * 0.3 * centrality);
    return {
      dist,
      mood: "delight",
      pay: Math.round(price * bonus) + tip,
      tip,
      rep: cust.orderId ? 2 : 1,
    };
  }
  // Close misses are forgiven; a clearly wrong jar costs a little reputation.
  const pay = Math.round(price * Math.max(0.2, 1 - dist * 4));
  const ok = dist < 0.06;
  return { dist, mood: ok ? "ok" : "meh", pay, tip: 0, rep: ok ? 0 : -1 };
}

// ---------- state ----------

export function newGame(seed = 1) {
  const s = {
    v: 1,
    seed: seed | 0,
    day: 1,
    phase: "morning", // morning → open → evening → (sleep) → morning
    clock: 0, // hours since opening
    coins: 40,
    rep: 5,
    nextId: 1,
    shelf: Array(SLOTS).fill(null),
    queue: [], // queue[0] is at the counter
    orders: [],
    nextArrival: 0,
    today: freshToday(5),
  };
  // A shelf already in progress, so day 1 has something to sell.
  const start = [
    ["dill", 0.4],
    ["kimchi", 0.2],
    ["hotsauce", 0.62],
    ["kraut", 0.33],
    ["dill", 0.08],
    ["kimchi", 0.5],
  ];
  start.forEach(([recipe, f], i) => {
    s.shelf[[0, 1, 2, 3, 4, 6][i]] = makeJar(s, recipe, f * RECIPES[recipe].hours);
  });
  return s;
}

function freshToday(rep) {
  return { served: 0, earned: 0, tips: 0, repStart: rep, missed: 0, preorders: 0, left: 0 };
}

function makeJar(s, recipe, age = 0) {
  return { id: s.nextId++, recipe, age, servings: SERVINGS };
}

function addRep(s, d) {
  s.rep = clamp(s.rep + d, 0, REP_MAX);
}

// ---------- customers ----------

function makeWalkIn(s) {
  const live = s.shelf.filter((j) => j && !isOver(j));
  let recipe, mid;
  if (live.length && random(s) < 0.3) {
    // Sometimes ask for something on the shelf, often a bit riper than it is now.
    const jar = pick(s, live);
    recipe = jar.recipe;
    mid = clamp(flavour(jar) + between(s, -0.05, 0.3), 0.1, 0.9);
  } else {
    recipe = pick(s, RECIPE_IDS);
    mid = between(s, 0.12, 0.9);
  }
  return {
    id: s.nextId++,
    name: pick(s, NAMES),
    look: Math.floor(random(s) * 1000),
    recipe,
    lo: clamp(mid - WINDOW / 2, 0, 1),
    hi: clamp(mid + WINDOW / 2, 0, 1),
    patience: PATIENCE,
  };
}

function arrivalGap(s) {
  return between(s, 0.8, 1.5) * (1.3 - s.rep / 20);
}

function leave(s, events, why) {
  const c = s.queue.shift();
  if (c.orderId) {
    s.orders = s.orders.filter((o) => o.id !== c.orderId);
    s.today.missed++;
    addRep(s, -2);
  } else if (why !== "closed") {
    addRep(s, -1);
  }
  if (why === "impatient") s.today.left++;
  events.push({ type: "left", customer: c, why });
  return c;
}

// ---------- the clock ----------

/** Advance the open shop by `hours`. Returns events for the UI to show. */
export function tick(s, hours) {
  const events = [];
  if (s.phase !== "open") return events;
  const dh = Math.min(hours, OPEN_HOURS - s.clock);
  s.clock += dh;
  for (const jar of s.shelf) {
    if (!jar) continue;
    const was = isOver(jar);
    jar.age += dh;
    if (!was && isOver(jar)) events.push({ type: "popped", jar });
  }

  // Pre-order customers come back on their due day.
  for (const o of s.orders) {
    if (o.due === s.day && !o.arrived && s.clock >= o.arriveAt) {
      o.arrived = true;
      const c = { ...o, id: s.nextId++, orderId: o.id, patience: PATIENCE * 1.5 };
      s.queue.splice(s.queue.length ? 1 : 0, 0, c);
      events.push({ type: "arrived", customer: c });
    }
  }
  while (s.clock >= s.nextArrival && s.nextArrival < OPEN_HOURS - 0.5) {
    if (s.queue.length < MAX_QUEUE) {
      const c = makeWalkIn(s);
      s.queue.push(c);
      events.push({ type: "arrived", customer: c });
    }
    s.nextArrival += arrivalGap(s);
  }

  const front = s.queue[0];
  if (front) {
    front.patience -= dh;
    if (front.patience <= 0) leave(s, events, "impatient");
  }

  if (s.clock >= OPEN_HOURS) closeShop(s, events);
  return events;
}

// ---------- player actions ----------
// Each returns { ok: true, ... } or { ok: false, why }.

export function brew(s, slot, recipe) {
  const r = RECIPES[recipe];
  if (!r) return { ok: false, why: "no such recipe" };
  if (s.phase === "evening") return { ok: false, why: "shop is closed" };
  if (s.shelf[slot]) return { ok: false, why: "slot is full" };
  if (s.coins < r.cost) return { ok: false, why: "not enough coins" };
  s.coins -= r.cost;
  s.shelf[slot] = makeJar(s, recipe);
  return { ok: true, jar: s.shelf[slot] };
}

export function tipOut(s, slot) {
  if (!s.shelf[slot]) return { ok: false, why: "empty slot" };
  s.shelf[slot] = null;
  return { ok: true };
}

export function serve(s, slot) {
  const c = s.queue[0];
  const jar = s.shelf[slot];
  if (!c) return { ok: false, why: "nobody at the counter" };
  if (!jar) return { ok: false, why: "empty slot" };
  if (jar.recipe !== c.recipe) return { ok: false, why: "wrong recipe" };
  if (isOver(jar)) return { ok: false, why: "jar has gone over" };
  const verdict = judge(c, flavour(jar));
  s.coins += verdict.pay;
  addRep(s, verdict.rep);
  s.today.served++;
  s.today.earned += verdict.pay;
  s.today.tips += verdict.tip;
  if (--jar.servings <= 0) s.shelf[slot] = null;
  if (c.orderId) s.orders = s.orders.filter((o) => o.id !== c.orderId);
  s.queue.shift();
  return { ok: true, customer: c, ...verdict };
}

/**
 * When a pre-order for `c` comes back: the day and hour at which a jar started
 * right now would sit in the middle of their window. Fair by construction.
 */
export function dueFor(s, c) {
  const need = ((c.lo + c.hi) / 2) * RECIPES[c.recipe].hours;
  const k = Math.max(1, Math.round((need + s.clock - 3) / 24));
  return { due: s.day + k, arriveAt: clamp(need - 24 * k + s.clock, 0.5, 9) };
}
export const dueDayFor = (s, c) => dueFor(s, c).due;

export function preorder(s) {
  const c = s.queue[0];
  if (!c) return { ok: false, why: "nobody at the counter" };
  if (c.orderId) return { ok: false, why: "already a pre-order" };
  const order = {
    id: s.nextId++,
    name: c.name,
    look: c.look,
    recipe: c.recipe,
    lo: c.lo,
    hi: c.hi,
    ...dueFor(s, c),
    arrived: false,
  };
  s.orders.push(order);
  s.today.preorders++;
  s.queue.shift();
  return { ok: true, order, customer: c };
}

export function sendAway(s) {
  if (!s.queue[0]) return { ok: false, why: "nobody at the counter" };
  const events = [];
  const c = leave(s, events, "sent");
  return { ok: true, customer: c };
}

export function openShop(s) {
  if (s.phase !== "morning") return { ok: false, why: "not morning" };
  s.phase = "open";
  s.clock = 0;
  s.nextArrival = between(s, 0.15, 0.5);
  s.today = freshToday(s.rep);
  return { ok: true };
}

export function closeShop(s, events = []) {
  if (s.phase !== "open") return { ok: false, why: "not open" };
  while (s.queue.length) leave(s, events, "closed");
  // Anyone whose pre-order was due today and never made it to the counter.
  for (const o of s.orders.filter((o) => o.due <= s.day)) {
    s.orders = s.orders.filter((x) => x !== o);
    s.today.missed++;
    addRep(s, -2);
  }
  s.phase = "evening";
  return { ok: true, events };
}

export function sleep(s) {
  if (s.phase !== "evening") return { ok: false, why: "not evening" };
  const overnight = 24 - s.clock;
  const popped = [];
  for (const jar of s.shelf) {
    if (!jar) continue;
    const was = isOver(jar);
    jar.age += overnight;
    if (!was && isOver(jar)) popped.push(jar);
  }
  s.day++;
  s.clock = 0;
  s.phase = "morning";
  return { ok: true, popped };
}
