// Balance-sim bots: four ways of keeping bees in Honey Hollow. A bot is a
// function (state) => action that reads the state only through the core's
// helpers and changes it only through step(). makeBot() gives each game its
// own bot, because a bot remembers a little between calls (when it last
// planned), and that memory must start empty for a replay to match.
//
// - sensible: plans the meadow with forecast(): it plants where a bed adds
//   the most honey of one kind, digs what spoils a hive's purity, stands new
//   hives where flowers are unclaimed, follows the bloom when a hive has
//   nothing in reach, empties hives before the flower changes, matches
//   wishes, crafts, treats mites, sees off wasps, answers queen cells with a
//   split or a bigger hive and tucks every hive in for winter.
// - lazy: never moves a hive, plants more of whatever is already round each
//   hive with no thought for what blooms when, takes honey only when a hive
//   is half full, hands each customer the first jar that will do, never
//   crafts, feeds, splits or enters the show, takes no notice of queen cells
//   (so its colonies swarm, and it catches the swarm when it can pay for a
//   spare hive) and leaves mites alone until they are harming a colony.
// - greedy: the sensible keeper, except that from autumn on it takes every
//   jar and never feeds.
// - completionist: plays for the goals. Every hive stands in a corner of its
//   plot, where it reaches eight squares that no other hive does, and each
//   corner grows flowers whose blooms do not meet: one flower at a time in
//   every hive, so every honey comes pure. Stall, workshop and care are the
//   sensible keeper's.
import * as C from "../../../games/honey-hollow/core/index.js";

const T = C.TUNING;
const W = T.PLOT_W;
const AVG = "cloudy"; // a middling day, for planning ahead
const BLEND = C.HONEYS.blend.price;

/** What a keeper looks like in the sim. The talent follows the seed so every one is played. */
export function keeperFor(seed = 1, name = "Bot") {
  return {
    name,
    body: seed % 2 ? "woman" : "man",
    skin: `s${(seed % 6) + 1}`,
    hair: seed % 2 ? "curls" : "tousled",
    hairColor: `h${(seed % 8) + 1}`,
    overalls: `o${(seed % 6) + 1}`,
    shirt: `t${(seed % 6) + 1}`,
    hat: "straw",
    talent: C.TALENT_IDS[(Math.abs(seed) - 1 + C.TALENT_IDS.length) % C.TALENT_IDS.length],
  };
}

// ---- shared pieces ----------------------------------------------------------

const calOf = (s) => C.calendarOf(s.clock.day);
const hivesOn = (s, plot) => s.hives.list.filter((h) => h.plot === plot);
const ownedPlots = (s) => C.PLOT_IDS.filter((id) => s.land.plots[id].owned);
/** True when step() would accept the action. Bots never send one it would refuse. */
const ok = (s, a) => C.step(s, a).events[0]?.type !== "rejected";

/** Year page, goals, and the bee book: the things any keeper taps away first. */
function housekeeping(s) {
  const due = C.yearDue(s);
  if (due) return { type: "seenYear", year: due.year };
  for (const g of C.goalsNow(s)) if (g.ready) return { type: "claimGoal", goal: g.goal.id };
  if (s.book.unread.length) return { type: "readFact", fact: s.book.unread[0] };
  return null;
}

/** Coins a day's load is worth as jars: the price of its flower at its purity, or blend. */
function loadValue(by) {
  let total = 0;
  let best = 0;
  let flower = null;
  for (const k in by) {
    total += by[k];
    if (by[k] > best && k !== "wild" && k !== "syrup") {
      best = by[k];
      flower = k;
    }
  }
  if (total <= 0) return 0;
  const p = best / total;
  let price = BLEND;
  if (flower && p >= T.STARS[0].at) {
    let mult = 1;
    for (const st of T.STARS) if (p >= st.at) mult = st.mult;
    price = C.HONEYS[flower].price * mult;
  }
  return (total / T.NECTAR_PER_JAR) * price;
}

/** Coins a jar's worth of nectar is worth to a colony that has not yet had its fill for the day. */
const FED = 10;
/** Two flowers in one hive's reach may bloom together for this many days, and no more. */
const CLASH_DAYS = 1;
/** Ground a new hive wants to itself, in near squares, and what each square shared with a neighbour costs. */
const HIVE_GROUND = 8;
const HIVE_MIX = 0.5;

/**
 * What every hive on a plot would bring home on `day`, in coins. The first
 * part of each load, up to what the colony needs to grow, counts extra: a
 * fed colony grows and a hungry one shrinks, whatever the honey sells for.
 */
function plotValue(s, plot, day) {
  const plans = C.forecastPlot(s, plot, { day, weather: AVG });
  let v = 0;
  for (const h of s.hives.list) {
    const p = plans[h.id];
    if (!p) continue;
    const fill = T.GROW_FACTOR * h.strength * T.EAT_PER_STRENGTH;
    v += loadValue(p.by) + (Math.min(p.total - p.wild, fill) / T.NECTAR_PER_JAR) * FED;
  }
  return v;
}

/** The state as it will be once every colony has grown into its hive: what to plant for. */
function grown(s) {
  return {
    ...s,
    hives: {
      ...s.hives,
      list: s.hives.list.map((h) => ({
        ...h,
        strength: Math.max(h.strength, C.limitOf(h)),
        moved: 0,
      })),
    },
  };
}

/** The same state with one square changed. */
function withSquare(s, plot, i, sq) {
  const p = s.land.plots[plot];
  const squares = p.squares.slice();
  squares[i] = sq;
  return { ...s, land: { plots: { ...s.land.plots, [plot]: { ...p, squares } } } };
}

/** The next day that falls on `doy`: today in the morning, else from tomorrow on. */
function dayOn(s, doy) {
  const today = s.clock.day;
  let d = today + ((doy - calOf(s).doy + T.YEAR_DAYS) % T.YEAR_DAYS);
  if (d === today && s.clock.phase !== "morning") d += T.YEAR_DAYS;
  return d;
}

/** Up to three days spread over a bloom window, each standing for a share of it. */
function sampleDays(w) {
  const len = w.to - w.from + 1;
  if (len <= 3) return Array.from({ length: len }, (_, i) => [w.from + i, 1]);
  const mid = Math.round((w.from + w.to) / 2);
  return [
    [w.from, len / 3],
    [mid, len / 3],
    [w.to, len / 3],
  ];
}

/** This year's days count in full; next year's a little less, since coins now grow the farm. */
const weightOf = (s, day) => (C.calendarOf(day).year === calOf(s).year ? 1 : 0.6);

/** Flowers this keeper could plant today. */
const seedsNow = (s) => C.shopNow(s).seeds;

/** Days two flowers bloom together for this keeper. */
function overlap(s, f, g) {
  const a = C.bloomWindow(s, f);
  const b = C.bloomWindow(s, g);
  return Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from) + 1);
}

/** The flowers each hive on a plot has in reach (beds, and the orchard's trees), by hive id. */
function flowersInReach(s, plot) {
  const out = {};
  const squares = s.land.plots[plot].squares;
  for (const h of hivesOn(s, plot)) {
    const set = (out[h.id] = new Set());
    for (const r of C.reachOf(plot, h.x, h.y)) {
      const sq = squares[r.y * W + r.x];
      if (sq?.t === "bed") set.add(sq.flower);
      else if (C.terrainAt(plot, r.x, r.y) === "tree") set.add("apple");
    }
  }
  return out;
}

/** How many beds of each flower the keeper has, over the whole Hollow. */
function bedCounts(s) {
  const n = {};
  for (const plot of ownedPlots(s))
    for (const sq of s.land.plots[plot].squares)
      if (sq?.t === "bed") n[sq.flower] = (n[sq.flower] ?? 0) + 1;
  return n;
}

// ---- sensible: planting -----------------------------------------------------

/**
 * The best few beds to plant now, by coins of honey gained per coin of seed.
 * Squares that the same hives reach at the same weights are alike, so one of
 * each kind is tried.
 */
function plantings(s, budget) {
  const ps = grown(s);
  const today = s.clock.day;
  const beds = bedCounts(s);
  // An open goal that asks for a honey is a reason to plant its flower.
  const wanted = new Set(
    C.goalsNow(s)
      .filter((g) => g.goal.measure === "jarsOf")
      .map((g) => g.goal.arg),
  );
  const fewKinds = C.measure(s, "kinds") < 5;
  const found = [];
  for (const plot of ownedPlots(s)) {
    const hives = hivesOn(s, plot);
    if (!hives.length) continue;
    // Group this plot's free squares by who reaches them and how.
    const classes = new Map();
    for (let i = 0; i < W * T.PLOT_H; i++) {
      const x = i % W;
      const y = Math.floor(i / W);
      if (s.land.plots[plot].squares[i]) continue;
      const ground = C.terrainAt(plot, x, y);
      if (ground !== "grass" && ground !== "hill") continue;
      let key = "";
      for (const h of hives) {
        const ring = Math.max(Math.abs(h.x - x), Math.abs(h.y - y));
        if (ring <= 2) key += `${h.id}:${ring};`;
      }
      if (!key) continue;
      key += ground + (C.canPlant(s, plot, x, y, "mint") === true ? "~" : "");
      if (!classes.has(key)) classes.set(key, []);
      classes.get(key).push(i);
    }
    if (!classes.size) continue;
    const free = s.land.plots[plot].squares.filter((sq) => !sq).length;
    const floor = 5 + Math.max(0, 24 - free) * 0.6;
    const base = {};
    const baseOn = (doy) => (base[doy] ??= plotValue(ps, plot, dayOn(s, doy)));
    const near = flowersInReach(s, plot);
    for (const seed of seedsNow(s)) {
      const cost = seed.have > 0 ? 0 : seed.price;
      if (cost > budget) continue;
      const w = C.bloomWindow(s, seed.flower);
      // A kind never yet jarred is worth going after; one already everywhere sells for less and less.
      const want =
        (s.progress.stats.stars[seed.flower] ? 1 : wanted.has(seed.flower) || fewKinds ? 4 : 2.5) /
        (1 + (beds[seed.flower] ?? 0) / 10);
      for (const [key, squares] of classes) {
        const i = squares[0];
        const x = i % W;
        const y = Math.floor(i / W);
        if (C.canPlant(s, plot, x, y, seed.flower) !== true) continue;
        // One flower at a time: nothing that blooms alongside what a hive already reaches.
        const clash = hives.some(
          (h) =>
            key.includes(`${h.id}:`) &&
            [...near[h.id]].some(
              (g) => g !== seed.flower && overlap(s, seed.flower, g) > CLASH_DAYS,
            ),
        );
        if (clash) continue;
        const hyp = withSquare(ps, plot, i, {
          t: "bed",
          flower: seed.flower,
          planted: today,
          picked: 0,
        });
        let gain = 0;
        for (const [doy, share] of sampleDays(w)) {
          const day = dayOn(s, doy);
          gain += (plotValue(hyp, plot, day) - baseOn(doy)) * share * weightOf(s, day);
        }
        gain *= want;
        // Squares run out before coins do: a bed must earn its place, more so on a crowded plot.
        if (gain < Math.max(floor, cost * 1.5)) continue;
        found.push({
          gain,
          score: gain - 1.5 * cost,
          cost,
          squares,
          action: { type: "plant", plot, x, y, flower: seed.flower },
        });
      }
    }
  }
  found.sort((a, b) => b.score - a.score);
  // Take the best, and a couple more of the same kind on its sister squares.
  const out = [];
  const best = found[0];
  if (best) {
    let left = budget;
    for (const i of best.squares.slice(0, 3)) {
      if (best.cost > left) break;
      left -= best.cost;
      out.push({ ...best.action, x: i % W, y: Math.floor(i / W) });
    }
  }
  return out;
}

/** A bed whose flower spoils more honey than it makes: dig it. Looked for now and then. */
function badBed(s) {
  const ps = grown(s);
  for (const plot of ownedPlots(s)) {
    if (!hivesOn(s, plot).length) continue;
    const squares = s.land.plots[plot].squares;
    const tried = new Set();
    for (let i = 0; i < squares.length; i++) {
      const sq = squares[i];
      if (!sq || sq.t !== "bed") continue;
      const w = C.bloomWindow(s, sq.flower);
      const hyp = withSquare(ps, plot, i, null);
      let gain = 0;
      for (const [doy, share] of sampleDays(w)) {
        const day = dayOn(s, doy);
        const key = `${plot}:${doy}`;
        if (!tried.has(key)) tried.add(key);
        gain += (plotValue(hyp, plot, day) - plotValue(ps, plot, day)) * share;
      }
      if (gain > 3) return { type: "dig", plot, x: i % W, y: Math.floor(i / W) };
    }
  }
  return null;
}

// ---- sensible: where hives stand --------------------------------------------

/**
 * The best free square for another hive: ground it could have beds on that no
 * other hive reaches, flowers already there, trees, and a pond nearby; not on
 * top of its neighbours.
 */
function hiveSpot(s) {
  let best = null;
  for (const plot of ownedPlots(s)) {
    const others = hivesOn(s, plot);
    if (others.length >= T.HIVES_PER_PLOT) continue;
    const squares = s.land.plots[plot].squares;
    for (let y = 0; y < T.PLOT_H; y++)
      for (let x = 0; x < W; x++) {
        if (C.canPlaceHive(s, plot, x, y) !== true) continue;
        // A colony wants eight or ten beds to itself, not the whole meadow: ground shared with a
        // neighbour is where honeys mix, so a corner of its own beats the middle.
        let own = 0;
        let mixed = 0;
        for (const r of C.reachOf(plot, x, y)) {
          const shared = others.some(
            (h) => Math.max(Math.abs(h.x - r.x), Math.abs(h.y - r.y)) <= 2,
          );
          const ground = C.terrainAt(plot, r.x, r.y);
          const sq = squares[r.y * W + r.x];
          let worth = 0;
          if (ground === "tree") worth = 2;
          else if (sq && sq.t === "bed") worth = 1.2;
          else if (!sq && (ground === "grass" || ground === "hill")) worth = 1;
          if (shared) mixed += worth * r.w;
          else own += worth * r.w;
        }
        let score =
          Math.min(own, HIVE_GROUND) - HIVE_MIX * mixed + (C.nearWater(plot, x, y) ? 1 : 0);
        if (!best || score > best.score) best = { score, plot, x, y };
      }
  }
  return best;
}

/** A few days of a hive's load, in coins, where it stands or at `at`, with what it costs its neighbours. */
function spotValue(s, hive, at, days) {
  let v = 0;
  for (const day of days) {
    const f = C.forecast(s, hive.id, at, { day, weather: AVG, settled: true });
    if (!f) return -Infinity;
    v += loadValue(f.by);
    for (const o of f.others) v += ((o.total - o.was) / T.NECTAR_PER_JAR) * BLEND;
  }
  return v;
}

/** Follow the bloom: a hive with little in reach for the next few days goes where there is more. */
function moveAny(s, memo) {
  const cal = calOf(s);
  if (cal.season === 3 || memo.movedOn === s.clock.day) return null;
  memo.movedOn = s.clock.day;
  const today = s.clock.day;
  const days = [today, today + 1, today + 2, today + 3].filter((d) => C.calendarOf(d).season !== 3);
  for (const h of s.hives.list) {
    if ((memo.settled[h.id] ?? 0) > today) continue;
    const full =
      ((h.strength * T.FORAGE_PER_STRENGTH * T.FLIGHT[AVG]) / T.NECTAR_PER_JAR) * 9 * days.length;
    const here = spotValue(s, h, null, days);
    if (here >= 0.5 * full) continue;
    let best = null;
    for (const plot of ownedPlots(s))
      for (let y = 0; y < T.PLOT_H; y++)
        for (let x = 0; x < W; x++) {
          if (C.canPlaceHive(s, plot, x, y, h.id) !== true) continue;
          const v = spotValue(s, h, { plot, x, y }, days);
          if (!best || v > best.v) best = { v, plot, x, y };
        }
    memo.settled[h.id] = today + 3;
    if (best && best.v > here * 1.6 + 8)
      return { type: "moveHive", hive: h.id, plot: best.plot, x: best.x, y: best.y };
  }
  return null;
}

// ---- sensible: honey, care, craft -------------------------------------------

/** Jars to take from a hive now, leaving the colony what it needs. */
function jarsToTake(s, h, greedy) {
  const cal = calOf(s);
  const total = C.totalOf(h.stores);
  let keep;
  if (cal.season >= 2) {
    // From autumn on: cheap honey stays as winter stores; dear honey is taken and syrup fed.
    const v = C.verdictOf(h.stores);
    const worth = v.product ? C.productInfo(v.product).price : 0;
    keep = greedy
      ? 0
      : worth <= T.SHOP.syrup.price + 2 || cal.season === 3
        ? C.winterNeed(s, h) + 1
        : C.mealOf(h, s.clock.day) + 1;
  } else {
    const meal = C.mealOf(h, s.clock.day);
    const coming = C.forecast(s, h.id)?.stored ?? 0;
    // In the morning a good day's forage is tonight's supper: empty the hive and the next honey runs purer.
    // In the evening, keep tonight's meal, and tomorrow's too if the forecast will not cover it.
    keep =
      s.clock.phase === "morning"
        ? Math.max(0, meal + 1 - coming)
        : meal + 1 + Math.max(0, meal - coming);
  }
  return Math.max(0, Math.min(C.jarsIn(h), Math.floor((total - keep + 1e-6) / T.NECTAR_PER_JAR)));
}

function harvestAny(s, greedy) {
  for (const h of s.hives.list) {
    const jars = jarsToTake(s, h, greedy);
    if (jars > 0) return { type: "harvest", hive: h.id, jars };
  }
  return null;
}

/** Mites: dust early, a remedy when it is serious. */
function care(s) {
  for (const h of s.hives.list) {
    if (h.mites >= T.MITES_STALL && s.stock.remedy > 0) return { type: "remedy", hive: h.id };
    if (h.mites >= 20 && h.dusted !== s.clock.day) return { type: "dust", hive: h.id };
    if (
      h.mites >= T.MITES_HARM - 5 &&
      s.stock.remedy < 1 &&
      s.purse.coins >= T.SHOP.remedy.price + 10
    )
      if (ok(s, { type: "buy", item: "remedy", n: 1 }))
        return { type: "buy", item: "remedy", n: 1 };
  }
  return null;
}

/**
 * Queen cells: split the colony into a spare hive if there is somewhere to
 * stand it, else give it a bigger hive. Failing both, calm() keeps them home.
 */
function swarmCare(s) {
  const h = s.hives.list.find((x) => x.swarmCells);
  if (!h) return null;
  if (h.strength >= T.SPLIT_MIN_STRENGTH) {
    const spot = hiveSpot(s);
    if (spot) {
      if (s.hives.spare >= 1)
        return { type: "split", hive: h.id, plot: spot.plot, x: spot.x, y: spot.y };
      const a = { type: "buy", item: "spare", n: 1 };
      if (ok(s, a)) return a;
    }
  }
  const up = C.upgradeOf(h);
  if (up && s.purse.coins >= up.cost + 8) return { type: "upgradeHive", hive: h.id };
  return null;
}

/** A colony with queen cells stays the night if honey was taken from it today: take a jar it can spare. */
function calm(s) {
  for (const h of s.hives.list)
    if (
      h.swarmCells &&
      h.harvested !== s.clock.day &&
      C.totalOf(h.stores) >= T.NECTAR_PER_JAR + C.mealOf(h, s.clock.day)
    )
      return { type: "harvest", hive: h.id, jars: 1 };
  return null;
}

/** A swarm in the hedge: into a spare hive with it. */
function catchAny(s) {
  const sw = s.hives.swarms[0];
  if (!sw) return null;
  const spot = hiveSpot(s);
  if (!spot) return null;
  if (s.hives.spare < 1) {
    const a = { type: "buy", item: "spare", n: 1 };
    return ok(s, a) ? a : null;
  }
  return { type: "catchSwarm", swarm: sw.id, plot: spot.plot, x: spot.x, y: spot.y };
}

/** Before a colony at its limit swarms (or just to grow the apiary): split it into a spare hive. */
function splitAny(s) {
  const cal = calOf(s);
  if (s.clock.phase !== "morning" || cal.season > 1 || s.clock.day < T.SWARMS_FROM_DAY) return null;
  const h = s.hives.list.find((x) => x.strength >= Math.max(T.SPLIT_MIN_STRENGTH, C.limitOf(x)));
  if (!h) return null;
  const spot = hiveSpot(s);
  if (!spot) return null;
  if (s.hives.spare < 1) {
    const a = { type: "buy", item: "spare", n: 1 };
    return s.purse.coins >= T.SHOP.spare.price + 5 && ok(s, a) ? a : null;
  }
  return { type: "split", hive: h.id, plot: spot.plot, x: spot.x, y: spot.y };
}

/** Pick a bunch when the workshop can use it: on a poor flying day, or as the bloom ends. */
function pickAny(s) {
  if (s.clock.phase !== "morning" || !C.workshopOpen(s)) return null;
  const first = s.progress.stats.picked === 0;
  const poor = s.weather.today === "rain" || s.weather.today === "windy";
  const { doy } = calOf(s);
  for (const plot of ownedPlots(s)) {
    const squares = s.land.plots[plot].squares;
    for (let i = 0; i < squares.length; i++) {
      const sq = squares[i];
      if (!sq || sq.t !== "bed" || !C.FLOWERS[sq.flower].bunch) continue;
      if ((s.stock.bunches[sq.flower] ?? 0) >= 2) continue;
      const late = doy >= C.bloomWindow(s, sq.flower).to - 1;
      if (!(first || poor || late)) continue;
      const a = { type: "pickBunch", plot, x: i % W, y: Math.floor(i / W) };
      if (ok(s, a)) return a;
    }
  }
  return null;
}

/** Make the thing that turns wax into the most coins, without flooding the stall with one good. */
function craftAny(s) {
  if (s.clock.phase === "day" || !C.workshopOpen(s) || C.craftsLeft(s) < 1) return null;
  const can = Object.fromEntries(C.recipesNow(s).map((r) => [r.recipe, r]));
  const stock = (id) => s.stock.goods[id] ?? 0;
  const made = (family) => C.MEASURES.craftedOf(s, family);
  if (can.remedy?.canMake && s.stock.remedy < 2) return { type: "craft", recipe: "remedy" };
  if (can.candle?.canMake && made("candle") === 0) return { type: "craft", recipe: "candle" };
  if (can.basket?.canMake && stock("basket") < 2) return { type: "craft", recipe: "basket" };
  if (can.soap?.canMake) {
    const bunch = can.soap.options.bunch.find((f) => stock(`soap-${f}`) < 3);
    if (bunch) return { type: "craft", recipe: "soap", bunch };
  }
  if (can.balm?.canMake && stock("balm") < 4) {
    // Never the good jars: balm is where blend and ivy honey go.
    const cheap = can.balm.options.honey[0];
    const worth = cheap
      ? C.productInfo(cheap).price *
        (C.productInfo(cheap).stars ? T.STARS[C.productInfo(cheap).stars - 1].mult : 1)
      : 0;
    if (cheap && (worth <= 12 || made("balm") === 0))
      return { type: "craft", recipe: "balm", honey: cheap };
  }
  if (can["lavender-candle"]?.canMake && stock("lavender-candle") < 3)
    return { type: "craft", recipe: "lavender-candle" };
  if (can.wraps?.canMake && stock("wraps") < 3) return { type: "craft", recipe: "wraps" };
  if (can.candle?.canMake && stock("candle") < 4) return { type: "craft", recipe: "candle" };
  return null;
}

/** Winter stores: top a short hive up with syrup once the flowers are over. */
function feedAny(s) {
  const cal = calOf(s);
  if (cal.doy < T.SHOW_DOY - 1) return null;
  for (const h of s.hives.list) {
    const short = C.winterNeed(s, h) + 1 - C.totalOf(h.stores);
    if (short <= 0) continue;
    if (C.totalOf(h.stores) + T.SYRUP_UNITS > C.capacityOf(h)) continue;
    if (s.stock.syrup > 0) return { type: "feed", hive: h.id, n: 1 };
    const a = { type: "buy", item: "syrup", n: 1 };
    if (ok(s, a)) return a;
  }
  return null;
}

// ---- sensible: spending -----------------------------------------------------

function spend(s, memo) {
  const cal = calOf(s);
  const today = s.clock.day;
  // Winter is for crafting and selling; plan again as spring comes near.
  if (cal.season === 3 && cal.doy < T.YEAR_DAYS - 2) return null;
  while (memo.queue.length) {
    const a = memo.queue.shift();
    if (ok(s, a)) return a;
  }
  const coins = s.purse.coins;
  const reserve = today <= 4 ? 0 : 8;

  // Seeds first: nothing else pays back as fast.
  if (memo.plantTries < 4 && coins - reserve >= 0) {
    memo.plantTries++;
    const list = plantings(s, coins - reserve);
    if (list.length) {
      memo.queue.push(...list.slice(1));
      return list[0];
    }
    memo.plantTries = 99;
  }
  if (memo.dugOn + 3 <= today) {
    memo.dugOn = today;
    const a = badBed(s);
    if (a) {
      memo.plantTries = 0;
      return a;
    }
  }
  const hives = s.hives.list;
  // More land once what there is has filled up. Winter is a fine time to buy it.
  const next = C.shopNow(s).plots[0];
  if (next && coins >= next.price + 15 && hives.length >= 3 * ownedPlots(s).length)
    return { type: "buyPlot", plot: next.plot };
  if (cal.season === 3) return null;

  const room = ownedPlots(s).some((p) => hivesOn(s, p).length < T.HIVES_PER_PLOT);
  const early = cal.doy <= 15; // a new colony needs time before winter

  // Three colonies to a plot are bought; the fourth comes from a split.
  if (
    room &&
    early &&
    hives.length < 3 * ownedPlots(s).length &&
    coins >= C.hiveCost(s) + reserve
  ) {
    const spot = hiveSpot(s);
    if (spot) return { type: "buyHive", plot: spot.plot, x: spot.x, y: spot.y };
  }
  // A colony at its limit: split it while there is room, else give it a bigger hive.
  if (room && early) {
    const a = splitAny(s);
    if (a) return a;
  }
  const maxed = hives
    .filter((h) => h.strength >= C.limitOf(h) && C.upgradeOf(h))
    .sort((a, b) => C.upgradeOf(a).cost - C.upgradeOf(b).cost)[0];
  if (maxed && cal.season <= 1 && coins >= C.upgradeOf(maxed).cost + reserve)
    return { type: "upgradeHive", hive: maxed.id };
  // A hive that keeps filling up wants more room even if the colony is not at its limit.
  const brim = hives.find((h) => C.upgradeOf(h) && C.totalOf(h.stores) >= 0.85 * C.capacityOf(h));
  if (brim && coins >= C.upgradeOf(brim).cost + reserve + 30)
    return { type: "upgradeHive", hive: brim.id };
  return null;
}

// ---- sensible: the stall ----------------------------------------------------

/** Jars held back for the Honey Show: the best jar of the three dearest pure honeys in stock. */
function showPicks(s) {
  const best = {};
  for (const it of C.shelf(s)) {
    const i = it.info;
    if (!i.pure) continue;
    if (!best[i.flower] || i.stars > best[i.flower].stars)
      best[i.flower] = {
        product: it.product,
        stars: i.stars,
        worth: T.RIBBONS[i.stars - 1].coins + i.price / 100,
      };
  }
  return Object.values(best)
    .sort((a, b) => b.worth - a.worth)
    .slice(0, T.SHOW_ENTRIES)
    .map((x) => x.product);
}

function heldBack(s) {
  const { doy } = calOf(s);
  const held = {};
  const over =
    doy === T.SHOW_DOY &&
    s.clock.phase === "evening" &&
    (!s.market.show || s.market.show.entered || s.market.open);
  if (doy >= 8 && doy <= T.SHOW_DOY && !over) for (const p of showPicks(s)) held[p] = 1;
  return held;
}

function serve(s) {
  const c = s.market.queue[s.market.at];
  if (!c) return null;
  const held = heldBack(s);
  const items = C.shelf(s).filter((it) => it.n - (held[it.product] ?? 0) >= 1);
  let best = null;
  for (const it of items) {
    if (!C.satisfies(c.wish, it.product)) continue;
    const n = Math.min(c.wish.qty, it.n);
    const worth = C.quote(s, it.product, n, "delighted") + (it.info.stars === 3 ? 10 : 5);
    if (!best || worth > best.worth) best = { worth, product: it.product };
  }
  if (!best)
    for (const it of items) {
      // Not what they asked for: only from a kind there is plenty of.
      if (it.n - (held[it.product] ?? 0) < 3) continue;
      const worth = C.quote(s, it.product, Math.min(c.wish.qty, it.n), "fine");
      if (!best || worth > best.worth) best = { worth, product: it.product };
    }
  return best
    ? { type: "offer", customer: c.id, product: best.product }
    : { type: "pass", customer: c.id };
}

/** The grocer takes what the stall did not: surplus only, and not so much of a kind that its price sinks. */
function grocer(s) {
  const held = heldBack(s);
  const tight = s.clock.day <= 10;
  for (const it of C.shelf(s)) {
    const keep = (held[it.product] ?? 0) + (tight ? 0 : 2);
    const glut = s.market.glut[it.info.key] ?? 0;
    const n = Math.min(it.n - keep, Math.floor((tight ? 9 : 6) - glut));
    if (n >= 1) return { type: "sellToGrocer", product: it.product, n };
  }
  return null;
}

function showEntry(s) {
  if (!s.market.show || s.market.show.entered || s.market.open) return null;
  const honeys = showPicks(s);
  return honeys.length ? { type: "enterShow", honeys } : null;
}

// ---- the keepers --------------------------------------------------------------

/** The evening of a keeper who minds the stall: honey, the show, customers, the grocer, the workshop. */
function evening(s, greedy) {
  let a;
  if ((a = harvestAny(s, greedy))) return a;
  if ((a = showEntry(s))) return a;
  if (!s.market.open) return { type: "openStall" };
  if ((a = serve(s))) return a;
  if ((a = grocer(s))) return a;
  if ((a = craftAny(s))) return a;
  if (!greedy && (a = feedAny(s))) return a;
  if ((a = calm(s))) return a;
  return { type: "sleep" };
}

/** The flying day: see off wasps, else let it run. */
function flying(s) {
  const raided = s.hives.list.find((h) => h.raid);
  if (raided) return { type: "fendWasps", hive: raided.id };
  return { type: "tick", n: T.TICKS_PER_DAY };
}

function sensible(s, memo, greedy) {
  const phase = s.clock.phase;
  let a;
  if ((a = housekeeping(s))) return a;
  if (phase === "day") return flying(s);
  if (phase === "morning") {
    if (memo.day !== s.clock.day)
      Object.assign(memo, { day: s.clock.day, plantTries: 0, queue: [] });
    if ((a = catchAny(s))) return a;
    if ((a = care(s))) return a;
    if ((a = harvestAny(s, greedy))) return a;
    if ((a = swarmCare(s))) return a;
    if ((a = moveAny(s, memo))) return a;
    if ((a = pickAny(s))) return a;
    if ((a = craftAny(s))) return a;
    if ((a = spend(s, memo))) return a;
    if (!greedy && (a = feedAny(s))) return a;
    return { type: "startDay" };
  }
  return evening(s, greedy);
}

// ---- completionist ------------------------------------------------------------

/**
 * The plan, in the order it is built. Each cell is a corner square for a hive
 * and the beds round it. A corner hive reaches only its own three-by-three,
 * so nothing here is shared; the flowers of one cell bloom one after another
 * (with a day between, so a green thumb's longer blooms still do not meet).
 * The orchard's cells have its trees for spring.
 */
const CELLS = [
  {
    plot: "home",
    hive: [0, 0],
    beds: {
      clover: [
        [1, 0],
        [1, 1],
        [2, 0],
      ],
      buckwheat: [
        [2, 1],
        [0, 2],
        [2, 2],
      ],
    },
  },
  {
    plot: "home",
    hive: [5, 0],
    beds: {
      lavender: [
        [4, 0],
        [4, 1],
        [5, 1],
        [3, 1],
      ],
      ivy: [
        [3, 0],
        [4, 2],
        [5, 2],
      ],
    },
  },
  {
    plot: "home",
    hive: [0, 5],
    beds: {
      borage: [
        [0, 4],
        [1, 4],
        [0, 3],
        [1, 3],
      ],
      dandelion: [
        [2, 4],
        [2, 5],
      ],
    },
  },
  {
    plot: "home",
    hive: [5, 5],
    beds: {
      sunflower: [
        [4, 4],
        [5, 4],
        [4, 5],
        [3, 5],
      ],
      dandelion: [
        [3, 3],
        [5, 3],
      ],
    },
  },
  {
    plot: "pond",
    hive: [0, 5],
    beds: {
      mint: [
        [2, 3],
        [2, 4],
        [2, 5],
      ],
      dandelion: [
        [0, 4],
        [1, 4],
        [1, 5],
      ],
    },
  },
  {
    plot: "pond",
    hive: [0, 0],
    beds: {
      clover: [
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 0],
      ],
      buckwheat: [
        [2, 1],
        [0, 2],
        [1, 2],
        [2, 2],
      ],
    },
  },
  {
    plot: "pond",
    hive: [5, 0],
    beds: {
      mint: [
        [3, 2],
        [4, 2],
        [5, 2],
      ],
      dandelion: [
        [4, 0],
        [4, 1],
        [5, 1],
      ],
    },
  },
  {
    plot: "orchard",
    hive: [5, 0],
    beds: {
      lavender: [
        [4, 0],
        [4, 1],
        [4, 2],
        [3, 0],
      ],
      ivy: [
        [3, 2],
        [5, 2],
      ],
    },
  },
  {
    plot: "orchard",
    hive: [0, 5],
    beds: {
      sunflower: [
        [1, 4],
        [1, 5],
        [1, 3],
        [0, 3],
        [2, 5],
      ],
    },
  },
  {
    plot: "orchard",
    hive: [0, 0],
    beds: {
      borage: [
        [1, 0],
        [0, 1],
        [2, 0],
        [0, 2],
      ],
    },
  },
  {
    plot: "orchard",
    hive: [5, 5],
    beds: {
      buckwheat: [
        [5, 4],
        [4, 5],
        [3, 4],
        [5, 3],
      ],
    },
  },
  {
    plot: "hill",
    hive: [0, 0],
    beds: {
      thyme: [
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 0],
      ],
      ivy: [
        [0, 2],
        [1, 2],
        [2, 2],
      ],
    },
  },
  {
    plot: "hill",
    hive: [5, 5],
    beds: {
      heather: [
        [4, 4],
        [5, 4],
        [4, 5],
        [3, 4],
      ],
      clover: [
        [3, 3],
        [5, 3],
      ],
    },
  },
  {
    plot: "hill",
    hive: [5, 0],
    beds: {
      heather: [
        [4, 0],
        [4, 1],
        [5, 1],
        [3, 0],
      ],
      lavender: [
        [3, 1],
        [4, 2],
        [5, 2],
      ],
    },
  },
  {
    plot: "hill",
    hive: [0, 5],
    beds: {
      thyme: [
        [1, 4],
        [1, 5],
        [0, 3],
        [1, 3],
      ],
      ivy: [
        [2, 3],
        [2, 4],
        [2, 5],
      ],
    },
  },
];
/** The cell whose hive is built up into a tall stack: four beds of borage feed even that colony. */
const TALL = CELLS[2];

const cellAt = (h) =>
  CELLS.find((c) => c.plot === h.plot && c.hive[0] === h.x && c.hive[1] === h.y);
function cellHive(s, c) {
  const sq = C.squareAt(s, c.plot, c.hive[0], c.hive[1]);
  return sq?.t === "hive" ? C.hiveById(s, sq.id) : null;
}
/** A hive that is not in a cell yet: the first skep, where a new game puts it. */
const strayHive = (s) => s.hives.list.find((h) => !cellAt(h));
/** Cells on owned land with nobody on the corner, in building order. `moving`: a hive that would move there. */
const freeCells = (s, moving = 0) =>
  CELLS.filter(
    (c) =>
      s.land.plots[c.plot].owned &&
      C.canPlaceHive(s, c.plot, c.hive[0], c.hive[1], moving) === true,
  );

/** Cells waiting for a new colony: the free ones, less the first if the stray hive is going there. */
function openCells(s) {
  const stray = strayHive(s);
  if (!stray) return freeCells(s);
  const mine = freeCells(s, stray.id)[0];
  return freeCells(s).filter((c) => c !== mine);
}

/** The first skep stays with the wild dandelions while they bloom, then takes the first corner. */
function settle(s) {
  const cal = calOf(s);
  const stray = strayHive(s);
  if (!stray || (cal.year === 1 && cal.doy < C.FLOWERS.dandelion.to + 1)) return null;
  const c = freeCells(s, stray.id)[0];
  return c ? { type: "moveHive", hive: stray.id, plot: c.plot, x: c.hive[0], y: c.hive[1] } : null;
}

/** A swarm goes into the next corner, if there is one. */
function catchInto(s) {
  const sw = s.hives.swarms[0];
  const c = sw && openCells(s)[0];
  if (!c) return null;
  if (s.hives.spare < 1) {
    const a = { type: "buy", item: "spare", n: 1 };
    return ok(s, a) ? a : null;
  }
  return { type: "catchSwarm", swarm: sw.id, plot: c.plot, x: c.hive[0], y: c.hive[1] };
}

/** Spend on the plan: beds for the cells that have a colony, a colony for the next cell, land, the tall hive. */
function build(s) {
  const cal = calOf(s);
  const coins = s.purse.coins;
  const reserve = s.clock.day <= 4 ? 0 : 8;
  const next = C.shopNow(s).plots[0];
  const tall = cellHive(s, TALL);
  const up = tall && C.upgradeOf(tall);
  const land = () => {
    if (up && coins >= up.cost + reserve + 30 && (!next || up.cost <= next.price / 2))
      return { type: "upgradeHive", hive: tall.id };
    if (next && coins >= next.price + 20) return { type: "buyPlot", plot: next.plot };
    return null;
  };
  if (cal.season === 3) return land();

  const stray = strayHive(s);
  const reserved = stray ? freeCells(s, stray.id)[0] : null;
  for (const c of CELLS) {
    if (!s.land.plots[c.plot].owned || !(c === reserved || cellHive(s, c))) continue;
    for (const [flower, squares] of Object.entries(c.beds)) {
      // A bed that will still bloom this year comes before one that is for next year.
      const soon = cal.doy < C.bloomWindow(s, flower).to;
      const price = C.FLOWERS[flower].seed;
      const inHand = (s.stock.seeds[flower] ?? 0) > 0;
      if (!inHand && coins - price < (soon ? reserve : reserve + 60)) continue;
      for (const [x, y] of squares)
        if (C.canPlant(s, c.plot, x, y, flower) === true)
          return { type: "plant", plot: c.plot, x, y, flower };
    }
  }

  // A colony for the next corner: half of a strong one if there is one (a spare hive is cheap), else a new skep.
  const spot = openCells(s)[0];
  if (spot && cal.doy <= 15) {
    const at = { plot: spot.plot, x: spot.hive[0], y: spot.hive[1] };
    const strong =
      cal.season <= 1 && s.clock.day >= T.SWARMS_FROM_DAY
        ? (s.hives.list.find((h) => h.swarmCells && h.strength >= T.SPLIT_MIN_STRENGTH) ??
          s.hives.list.find((h) => h.strength >= Math.max(T.SPLIT_MIN_STRENGTH, C.limitOf(h))))
        : null;
    if (strong && s.hives.spare >= 1) return { type: "split", hive: strong.id, ...at };
    const spare = { type: "buy", item: "spare", n: 1 };
    if (strong && coins >= T.SHOP.spare.price + reserve && ok(s, spare)) return spare;
    if (!strong && coins >= C.hiveCost(s) + reserve + 12) return { type: "buyHive", ...at };
  }
  return land();
}

function completionist(s) {
  const phase = s.clock.phase;
  let a;
  if ((a = housekeeping(s))) return a;
  if (phase === "day") return flying(s);
  if (phase === "morning") {
    if ((a = catchInto(s))) return a;
    if ((a = care(s))) return a;
    if ((a = harvestAny(s, false))) return a;
    if ((a = settle(s))) return a;
    if ((a = pickAny(s))) return a;
    if ((a = craftAny(s))) return a;
    if ((a = build(s))) return a;
    if ((a = feedAny(s))) return a;
    return { type: "startDay" };
  }
  return evening(s, false);
}

/** Beds in a hive's reach. */
function bedsNear(s, h) {
  const squares = s.land.plots[h.plot].squares;
  return C.reachOf(h.plot, h.x, h.y).filter((r) => squares[r.y * W + r.x]?.t === "bed").length;
}

/** Free squares in a hive's reach, nearest first. */
function freeNear(s, h) {
  const squares = s.land.plots[h.plot].squares;
  return C.reachOf(h.plot, h.x, h.y)
    .filter(
      (r) => !squares[r.y * W + r.x] && ["grass", "hill"].includes(C.terrainAt(h.plot, r.x, r.y)),
    )
    .sort((a, b) => b.w - a.w);
}

/** The seed a lazy keeper plants round a hive: more of what is already there, else the next in the shop. */
function lazyFlower(s, h) {
  const squares = s.land.plots[h.plot].squares;
  const seeds = seedsNow(s);
  for (const r of C.reachOf(h.plot, h.x, h.y)) {
    const sq = squares[r.y * W + r.x];
    const seed = sq?.t === "bed" && !sq.wild ? seeds.find((x) => x.flower === sq.flower) : null;
    if (seed) return seed;
  }
  return seeds[(h.id + s.progress.stats.planted) % seeds.length];
}

function lazy(s) {
  const phase = s.clock.phase;
  let a;
  if ((a = housekeeping(s))) return a;
  if (phase === "day") return { type: "tick", n: T.TICKS_PER_DAY };
  if (phase === "morning") {
    // A swarm hanging in the hedge is hard to walk past: into a spare hive, if there is one or the coins for one.
    const sw = s.hives.swarms[0];
    if (sw) {
      let spot = null;
      for (const plot of ownedPlots(s))
        for (let y = 1; y < T.PLOT_H && !spot; y++)
          for (let x = 1; x < W && !spot; x++) {
            const far = hivesOn(s, plot).every(
              (h) => Math.max(Math.abs(h.x - x), Math.abs(h.y - y)) >= 3,
            );
            if (far && C.canPlaceHive(s, plot, x, y) === true) spot = { plot, x, y };
          }
      a = { type: "buy", item: "spare", n: 1 };
      if (spot && s.hives.spare >= 1) return { type: "catchSwarm", swarm: sw.id, ...spot };
      if (spot && s.purse.coins >= T.SHOP.spare.price + 15 && ok(s, a)) return a;
    }
    // Honey only when a hive is half full, and never the last of it. Queen cells go unnoticed.
    for (const h of s.hives.list) {
      const total = C.totalOf(h.stores);
      if (total < 0.5 * C.capacityOf(h)) continue;
      const keep = calOf(s).season >= 2 ? C.winterNeed(s, h) + 5 : C.mealOf(h, s.clock.day) + 5;
      const jars = Math.min(C.jarsIn(h), Math.floor((total - keep) / T.NECTAR_PER_JAR));
      if (jars > 0) return { type: "harvest", hive: h.id, jars };
    }
    // Mites only once they are harming a colony; then a dusting every morning until the warning is gone.
    for (const h of s.hives.list) {
      const course = h.mites >= T.MITES_SPOTTED && h.dusted === s.clock.day - 1;
      if ((h.mites >= T.MITES_HARM || course) && h.dusted !== s.clock.day)
        return { type: "dust", hive: h.id };
    }
    if (calOf(s).season === 3) return { type: "startDay" };
    const coins = s.purse.coins;
    // One kind of flower round each hive, on the nearest free squares, a few beds for each bee.
    const byBeds = [...s.hives.list].sort((x, y) => bedsNear(s, x) - bedsNear(s, y) || x.id - y.id);
    for (const h of byBeds) {
      if (bedsNear(s, h) >= 4 + 2 * h.strength) continue; // enough around this one
      const seed = lazyFlower(s, h);
      if (!seed || !(seed.have > 0 || coins >= seed.price + 5)) continue;
      for (const r of freeNear(s, h)) {
        a = { type: "plant", plot: h.plot, x: r.x, y: r.y, flower: seed.flower };
        if (ok(s, a)) return a;
      }
    }
    const maxed = s.hives.list.find((h) => h.strength >= C.limitOf(h) && C.upgradeOf(h));
    if (maxed && coins >= C.upgradeOf(maxed).cost + 20)
      return { type: "upgradeHive", hive: maxed.id };
    if (coins >= C.hiveCost(s) + 20 && calOf(s).doy <= 15) {
      // The first free square well away from the other hives, on any plot with room.
      for (const plot of ownedPlots(s))
        for (let y = 1; y < T.PLOT_H; y++)
          for (let x = 1; x < W; x++) {
            const far = hivesOn(s, plot).every(
              (h) => Math.max(Math.abs(h.x - x), Math.abs(h.y - y)) >= 3,
            );
            if (far && C.canPlaceHive(s, plot, x, y) === true)
              return { type: "buyHive", plot, x, y };
          }
    }
    const next = C.shopNow(s).plots[0];
    if (next && coins >= next.price + 40) return { type: "buyPlot", plot: next.plot };
    return { type: "startDay" };
  }
  // Evening: the stall, with no thought for who wants what; then the grocer takes the rest.
  if (!s.market.open && C.shelf(s).length) return { type: "openStall" };
  const c = s.market.queue[s.market.at];
  if (s.market.open && c) {
    const items = C.shelf(s);
    const it = items.find((x) => C.satisfies(c.wish, x.product)) ?? items[0];
    return it
      ? { type: "offer", customer: c.id, product: it.product }
      : { type: "pass", customer: c.id };
  }
  const it = C.shelf(s)[0];
  if (it) return { type: "sellToGrocer", product: it.product, n: it.n };
  return { type: "sleep" };
}

/**
 * A fresh bot. `kind` is "sensible", "lazy", "greedy" or "completionist";
 * `seed` picks the keeper's look and talent.
 */
export function makeBot(kind = "sensible", seed = 1) {
  const memo = { day: 0, plantTries: 0, queue: [], movedOn: 0, dugOn: 0, settled: {} };
  return (s) => {
    if (!s.keeper.made)
      return {
        type: "createKeeper",
        keeper: keeperFor(seed, kind[0].toUpperCase() + kind.slice(1)),
      };
    if (kind === "completionist") return completionist(s);
    return kind === "lazy" ? lazy(s) : sensible(s, memo, kind === "greedy");
  };
}

export const BOT_KINDS = ["sensible", "lazy", "greedy", "completionist"];

/**
 * Play `bot` from `state` until the morning of day `untilDay`. Every action
 * must be accepted. `onStep(before, action, result)` sees each one.
 */
export function play(bot, state, untilDay, onStep) {
  let s = state;
  const actions = [];
  const events = [];
  for (let guard = 0; s.clock.day < untilDay; guard++) {
    if (guard > 400 * (untilDay - state.clock.day + 1) + 1000)
      throw new Error(`bot stuck on day ${s.clock.day} (${s.clock.phase})`);
    const action = bot(s);
    const r = C.step(s, action);
    if (r.events[0]?.type === "rejected")
      throw new Error(
        `day ${s.clock.day} ${s.clock.phase}: ${JSON.stringify(action)} rejected: ${r.events[0].why}`,
      );
    onStep?.(s, action, r);
    actions.push(action);
    for (const e of r.events) events.push(e);
    s = r.state;
  }
  return { state: s, actions, events };
}
