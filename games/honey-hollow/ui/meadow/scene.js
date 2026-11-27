// @ts-check
/**
 * The meadow's picture. Two stacked canvases: the ground (redrawn only when
 * it changes, or while a cloud's shadow or a change of light crosses it) and
 * everything that stands, flies or falls on it (redrawn every frame, from
 * cached sprites only: nothing is painted while the scene runs except a
 * sprite seen for the first time).
 *
 * The scene keeps no pixels. Things live in squares; where a square is on
 * the canvas is worked out from the canvas's size (./layout.js) whenever
 * that changes. It reads the game's state in `sync` and never changes it,
 * and it asks the core for every rule (what flies, what a tree looks like,
 * what may stand where).
 */

import { put, paintAll, DPR } from "../paint/sprite.js";
import { bed } from "../art/flowers.js";
import { tree, rock, marker } from "../art/scenery.js";
import { ground } from "../art/ground.js";
import { hive } from "../art/hives.js";
import {
  bee,
  swarm,
  wasp,
  butterfly,
  ladybird,
  snail,
  bird,
  BUTTERFLIES,
} from "../art/creatures.js";
import { raindrop, snowflake, cloudShadow } from "../art/sky.js";
import { keeper, STANDING } from "../art/people.js";
import { jar } from "../art/jars.js";
import { N, PAD, FEET, blank, layOut } from "./layout.js";
import {
  meterBack,
  meterFill,
  badge,
  twinkle,
  speck,
  lawn,
  soil,
  ripple,
  METER_W,
  FILL_W,
  FILL_H,
} from "./marks.js";
import { createBees } from "./bees.js";
import { createLife } from "./life.js";

/** @typedef {import("../paint/sprite.js").Sprite} Sprite */
/**
 * @typedef {object} Item one thing standing on a square
 * @property {string} kind
 * @property {number} x
 * @property {number} y
 * @property {Sprite} s
 * @property {Sprite | null} s2 a second frame, for things that stir
 * @property {number} sway
 * @property {number} ph
 * @property {number} lift squares above its feet (a swarm up in a tree)
 * @property {number} id
 * @property {boolean} thin a tree with something behind its crown: drawn see-through
 */

const SEASONS = ["spring", "summer", "autumn", "winter"];
/** The canvas runs this far past the stage, above and below. */
export const TOP = 16;
export const BOTTOM = 8;
/** The keeper's height, in squares. */
const KEEPER_TALL = 1.22;
/** How high above its feet a bed's flowers are, in squares (where bees hover). */
const HEAD = {
  dandelion: 0.3,
  clover: 0.26,
  borage: 0.5,
  lavender: 0.52,
  thyme: 0.22,
  mint: 0.42,
  sunflower: 0.92,
  buckwheat: 0.5,
  heather: 0.32,
  ivy: 0.45,
  apple: 1.2,
};
/** Low mats barely move in the wind. */
const SWAY = {
  clover: 0.45,
  thyme: 0.4,
  dandelion: 0.7,
  heather: 0.6,
  ivy: 0.5,
  mint: 0.8,
  sunflower: 0.8,
};
const BEE_CAP = 40;
const FX = 56;
/** The keeper's pictures, painted with the plot so none arrives late. */
const POSES = [
  ["wave", "happy"],
  ["carry", "happy"],
  ["stand", "oops"],
  ["smoker", "calm"],
];

/** The painters, loosely typed: kinds and stages come from the game's state. */
const art = /** @type {Record<string, (...a: any[]) => Sprite>} */ (
  /** @type {any} */ ({
    bed,
    tree,
    rock,
    marker,
    ground,
    hive,
    bee,
    swarm,
    wasp,
    butterfly,
    ladybird,
    snail,
    bird,
    keeper,
    jar,
  })
);

/** A bed's sprite; an unknown flower or stage falls back instead of throwing. */
function bedSprite(flower, stage, variant) {
  try {
    return art.bed(flower, stage, variant);
  } catch {
    try {
      return art.bed("clover", stage, variant);
    } catch {
      return art.bed("clover", "leaf", 0);
    }
  }
}

function hiveSprite(type, snowy) {
  try {
    return art.hive(type, snowy);
  } catch {
    return art.hive("skep", snowy);
  }
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** A steady scatter: the same number 0..1 for the same n, with no memory. */
const scatter = (n) => {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * @param {{ stage: HTMLElement, bg: HTMLCanvasElement, fg: HTMLCanvasElement, core: any,
 *   onLayout?: (geo: import("./layout.js").Geo) => void }} o
 */
export function createScene({ stage, bg, fg, core, onLayout }) {
  const bctx = /** @type {CanvasRenderingContext2D} */ (bg.getContext("2d"));
  const ctx = /** @type {CanvasRenderingContext2D} */ (fg.getContext("2d"));
  // The ground with what lies flat on it, composed once and blitted after.
  const base = document.createElement("canvas");
  const basectx = /** @type {CanvasRenderingContext2D} */ (base.getContext("2d"));
  let baseDirty = true;
  // One pixel, for asking a sprite whether it is painted at a point.
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const pctx = /** @type {CanvasRenderingContext2D} */ (
    probe.getContext("2d", { willReadFrequently: true })
  );

  const geo = blank();
  let dpr = DPR;
  let fine = 3; // the most device pixels per CSS pixel the canvases use
  let stale = true;
  let dirty = true;
  let bgDirty = true;
  let motion = true;
  let pace = 1;
  let draws = 0;
  let T = 0;
  let dead = false;

  let plot = "";
  let season = 0;
  let owned = false;
  let wx = "sunny";
  /** @type {Sprite | null} */
  let gnd = null;
  let gndSize = 0;
  let regrind = 0;

  /** @type {Item[]} */
  let items = [];
  let sig = "";
  /** @type {{ x: number, y: number }[]} */
  let blooms = [];
  /** @type {{ x: number, y: number }[]} beds young enough to want earth under them */
  let young = [];
  /** @type {{ x: number, y: number, lift: number }[]} */
  let hanging = [];
  /** @type {{ id: number, x: number, y: number, fill: number, jars: number, badge: Sprite | null, raid: boolean, ph: number }[]} */
  let hv = [];
  const glow = new Uint8Array(N * N); // 1: may be used, 2: one of the best
  const reach = new Uint8Array(N * N);
  let marks = false;
  let armed = false; // a brush or a hive is in hand
  let pickX = -1;
  let pickY = -1;
  let hovX = -1;
  let hovY = -1;
  /** @type {{ x: number, y: number } | null} */
  let ghost = null;
  /** @type {Sprite | null} */
  let ghostS = null;
  let fade = 0;
  const popAt = new Float32Array(N * N);
  const shakeAt = new Float32Array(N * N);

  // The light of the hour and the weather: a colour laid over what is painted.
  const light = { r: 255, g: 255, b: 255, a: 0, tr: 255, tg: 255, tb: 255, ta: 0, css: "" };

  const bees = createBees();
  let beeSig = "";
  let beeIds = "";
  let beeFly = false;
  let fresh = false;
  const life = createLife();
  const dry = (x, y) =>
    x >= 0 && y >= 0 && x < N && y < N && core.terrainAt(plot, x | 0, y | 0) !== "water";

  // The keeper: where she is, where she is going, which picture she wears.
  const kp = {
    on: false,
    x: 3,
    y: 5.96,
    tx: 3,
    ty: 5.96,
    wx: 0,
    wy: 0,
    way: false,
    walking: false,
    flip: false,
    until: 0,
    /** @type {Sprite | null} */
    s: null,
    /** @type {Sprite | null} what she wears when nothing is happening */
    rest: null,
    /** @type {Sprite | null} */
    stand: null,
  };
  /** @type {Map<string, [number, number]>} */
  const stood = new Map();
  /** @type {Map<string, Sprite>} */
  const poses = new Map();
  let kLook = "";
  let warming = 0;
  const kOpt = { rot: 0, flip: false, alpha: 1 };
  const pOpt = { rot: 0, flip: false, alpha: 1 };

  const fx = Array.from({ length: FX }, () => ({
    on: false,
    kind: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    t: 0,
    life: 1,
    k: 1,
    /** @type {Sprite | null} */
    s: null,
  }));

  // Sprites every plot uses; filled in by `prepare`.
  /** @type {Record<string, Sprite>} */
  const S = {};
  const common = () => {
    S.near = art.marker("near");
    S.far = art.marker("far");
    S.ok = art.marker("ok");
    S.no = art.marker("no");
    S.pick = art.marker("pick");
    S.bee0 = art.bee(0);
    S.bee1 = art.bee(1);
    S.back = meterBack();
    S.fill = meterFill();
    S.twinkle = twinkle();
    S.lawn = lawn();
    S.soil = soil();
  };

  const watcher = new ResizeObserver(() => {
    stale = true;
  });
  watcher.observe(stage);

  // ---------------------------------------------------------------- layout

  function measure() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w < 20 || h < 20) return false;
    dpr = Math.min(fine, Math.max(1, globalThis.devicePixelRatio || 1));
    layOut(w, h, TOP, BOTTOM, geo);
    const cw = Math.round(geo.W * dpr);
    const ch = Math.round(geo.H * dpr);
    if (bg.width !== cw || bg.height !== ch) {
      bg.width = fg.width = cw;
      bg.height = fg.height = ch;
    }
    baseDirty = bgDirty = dirty = true;
    if (gnd && gndSize && Math.abs(geo.G - gndSize) / gndSize > 0.12) {
      clearTimeout(regrind);
      regrind = Number(setTimeout(repaintGround, 350));
    }
    onLayout?.(geo);
    return true;
  }
  const fresher = () => {
    if (!stale) return;
    stale = false;
    measure();
  };

  function repaintGround() {
    if (dead || !plot) return;
    gnd = art.ground(plot, SEASONS[season], geo.G, geo.G, core.PLOTS[plot].terrain, geo.G * PAD);
    gndSize = geo.G;
    baseDirty = bgDirty = true;
  }

  // ---------------------------------------------------------------- sprites

  const variantOf = (x, y) => (x * 7 + y * 13) % 2;

  /**
   * Paint what plot `id` needs today, without freezing the page. Gives a
   * ticket for `show`; the plot on show stays up meanwhile.
   * @param {any} state
   * @param {string} id
   * @param {(share: number) => void} [onProgress]
   */
  async function prepare(state, id, onProgress) {
    if (stale || !geo.W) {
      stale = false;
      measure();
    }
    const cal = core.calendarOf(state.clock.day);
    const name = SEASONS[cal.season];
    const snowy = cal.season === 3;
    const size = geo.G || 320;
    const ts = core.treeStageOf(state);
    /** @type {Sprite | null} */
    let g = null;
    /** @type {(() => void)[]} */
    const jobs = [
      () => {
        g = art.ground(id, name, size, size, core.PLOTS[id].terrain, size * PAD);
      },
      common,
    ];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const t = core.terrainAt(id, x, y);
        if (t === "tree") jobs.push(() => art.tree(ts, (x + y) % 2));
        else if (t === "rock") jobs.push(() => art.rock((x * 2 + y) % 3, snowy));
        const sq = core.squareAt(state, id, x, y);
        if (sq?.t === "bed")
          jobs.push(() => bedSprite(sq.flower, core.stageOf(state, sq), variantOf(x, y)));
        else if (sq?.t === "hive")
          jobs.push(() => hiveSprite(core.hiveById(state, sq.id)?.type, snowy));
      }
    if (!snowy) {
      jobs.push(
        () => (S.fly00 = art.butterfly(BUTTERFLIES[0], 0)),
        () => (S.fly01 = art.butterfly(BUTTERFLIES[0], 1)),
        () => (S.fly10 = art.butterfly(BUTTERFLIES[1], 0)),
        () => (S.fly11 = art.butterfly(BUTTERFLIES[1], 1)),
        () => (S.bug = art.ladybird()),
        () => (S.slug = art.snail()),
      );
    } else
      jobs.push(
        () => (S.tit0 = art.bird(0)),
        () => (S.tit1 = art.bird(1)),
      );
    jobs.push(() => weatherSprites(state.weather.today, cal.season));
    if (state.keeper?.made) {
      jobs.push(() => art.keeper(state.keeper, "stand", "calm"));
      for (const [pose, feel] of POSES) jobs.push(() => art.keeper(state.keeper, pose, feel));
    }
    await paintAll(jobs, onProgress);
    return { plot: id, season: cal.season, ground: /** @type {Sprite | null} */ (g), size };
  }

  function weatherSprites(w, s) {
    if (w === "rain") {
      S.rain ??= raindrop();
      S.ripple ??= ripple();
    } else if (w === "snow") S.snow ??= snowflake();
    else if (w === "cloudy" || w === "windy") S.cloud ??= cloudShadow();
    if (w === "windy") {
      S.leafA ??= speck(s === 2 ? "amber" : "sap");
      S.leafB ??= speck(s === 2 ? "terracotta" : s === 0 ? "blush" : "leaf");
    }
  }

  /** Put a prepared plot on show. Follow it with `sync`. */
  function show(ticket) {
    if (plot) stood.set(plot, [kp.x, kp.y]);
    plot = ticket.plot;
    season = ticket.season;
    gnd = ticket.ground;
    gndSize = ticket.size;
    sig = "";
    beeSig = "";
    beeIds = "";
    popAt.fill(0);
    shakeAt.fill(0);
    hovX = hovY = -1;
    for (const p of fx) p.on = false;
    const at = stood.get(plot);
    if (at) {
      kp.x = at[0];
      kp.y = at[1];
    } else {
      kp.x = 3;
      kp.y = 5.96;
      for (const x of [2.96, 1.96, 3.96, 0.96, 4.96, 5.9, 0.1])
        if (dry(x, 5.5)) {
          kp.x = x;
          break;
        }
    }
    kp.tx = kp.x;
    kp.ty = kp.y;
    kp.way = kp.walking = false;
    baseDirty = bgDirty = dirty = true;
  }

  function setLook(look) {
    const s = look ? JSON.stringify(look) : "";
    if (s === kLook) return;
    kLook = s;
    poses.clear();
    kp.on = !!look;
    kp.until = 0;
    clearTimeout(warming);
    if (!look) return;
    kp.stand = kp.rest = kp.s = art.keeper(look, "stand", "calm");
    // The other poses: already painted with the plot as a rule, so this costs
    // nothing; after a change of clothes they come one at a time.
    const more = POSES.slice();
    const next = () => {
      const p = more.shift();
      if (dead || !p || kLook !== s) return;
      const t0 = performance.now();
      poses.set(`${p[0]}|${p[1]}`, art.keeper(look, p[0], p[1]));
      if (performance.now() - t0 < 4) next();
      else warming = Number(setTimeout(next, 500));
    };
    next();
  }

  // ---------------------------------------------------------------- reading the state

  function rebuild(state) {
    const ts = core.treeStageOf(state);
    const snowy = season === 3;
    items = [];
    blooms = [];
    young = [];
    hanging = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const t = core.terrainAt(plot, x, y);
        const ph = x * 1.9 + y * 2.7;
        if (t === "tree") {
          items.push({
            kind: "tree",
            x,
            y,
            s: art.tree(ts, (x + y) % 2),
            s2: null,
            sway: 0.28,
            ph,
            lift: 0,
            id: 0,
            thin: false,
          });
          if (ts === "bloom") blooms.push({ x: x + 0.5, y: y + FEET - 1.1 });
        } else if (t === "rock")
          items.push({
            kind: "rock",
            x,
            y,
            s: art.rock((x * 2 + y) % 3, snowy),
            s2: null,
            sway: 0,
            ph,
            lift: 0,
            id: 0,
            thin: false,
          });
        const sq = core.squareAt(state, plot, x, y);
        if (sq?.t === "bed") {
          const st = core.stageOf(state, sq);
          const still = st === "seed" || st === "dormant";
          items.push({
            kind: "bed",
            x,
            y,
            s: bedSprite(sq.flower, st, variantOf(x, y)),
            s2: null,
            sway: still ? 0 : (SWAY[sq.flower] ?? 1),
            ph,
            lift: 0,
            id: 0,
            thin: false,
          });
          if (st === "bloom") blooms.push({ x: x + 0.5, y: y + FEET - (HEAD[sq.flower] ?? 0.45) });
          if (st === "leaf" || st === "bud" || st === "faded") young.push({ x, y });
        } else if (sq?.t === "hive") {
          const h = core.hiveById(state, sq.id);
          items.push({
            kind: "hive",
            x,
            y,
            s: hiveSprite(h?.type, snowy),
            s2: null,
            sway: 0,
            ph,
            lift: 0,
            id: sq.id,
            thin: false,
          });
        }
      }
      for (const w of state.hives.swarms) {
        if (w.plot !== plot || w.y !== y) continue;
        const up = core.terrainAt(plot, w.x, w.y) === "tree" ? 0.62 : 0;
        items.push({
          kind: "swarm",
          x: w.x,
          y,
          s: art.swarm(0),
          s2: art.swarm(1),
          sway: 0.5,
          ph: w.x,
          lift: up,
          id: w.id,
          thin: false,
        });
        hanging.push({ x: w.x, y, lift: up });
      }
    }
    // A crown with something behind it is drawn see-through.
    for (const it of items) {
      if (it.kind !== "tree") continue;
      it.thin = items.some(
        (o) =>
          o !== it &&
          o.kind !== "tree" &&
          o.kind !== "rock" &&
          ((o.y === it.y - 1 && Math.abs(o.x - it.x) <= 1) || (o.y === it.y - 2 && o.x === it.x)),
      );
    }
    baseDirty = bgDirty = true;
  }

  function badgeFor(flags) {
    if (flags.includes("wasps")) return badge("wasps");
    if (flags.includes("queen-cells")) return badge("queen");
    if (flags.includes("hungry")) return badge("hungry");
    if (flags.includes("mites") || flags.includes("mites-bad")) return badge("mites");
    return null;
  }

  function markReach(x, y) {
    for (const r of core.reachOf(plot, x, y)) {
      const t = core.terrainAt(plot, r.x, r.y);
      if (t === "water" || t === "rock") continue;
      reach[r.y * N + r.x] = r.w >= 1 ? 1 : 2;
    }
  }

  function assignBees(state) {
    const phase = state.clock.phase;
    const out = owned && core.fliesToday(state, plot);
    const flying = out && phase === "day" && state.plan?.day === state.clock.day;
    const flight = Math.max(0.05, Number(core.flightOf(state, plot)) || 0);
    /** @type {import("./bees.js").Home[]} */
    const list = [];
    let total = 0;
    let ids = "";
    for (const h of state.hives.list) {
      if (h.plot !== plot) continue;
      ids += `${h.id},`;
      const p = state.plan?.hives?.[h.id];
      /** @type {import("./bees.js").Home} */
      const home = { x: h.x + 0.5, y: h.y + 0.64, n: 0, mode: "none", spots: [], wild: 0 };
      if (!out) home.mode = "none";
      else if (flying && p && p.total > 0) {
        home.mode = "fly";
        home.n = Math.max(flight < 0.5 ? 1 : 3, Math.round(h.strength * 2.4 * Math.sqrt(flight)));
        for (const b of p.beds)
          home.spots.push({ x: b.x + 0.5, y: b.y + FEET - (HEAD[b.flower] ?? 0.45), w: b.units });
        home.wild = Math.max(0, Number(p.wild) || 0);
        total += home.n;
      } else {
        home.mode = "door";
        home.n = Math.min(3, 1 + Math.floor(h.strength / 3));
      }
      list.push(home);
    }
    if (total > BEE_CAP)
      for (const home of list)
        if (home.mode === "fly") home.n = Math.max(2, Math.floor((home.n * BEE_CAP) / total));
    let s = `${plot}|${flying ? state.clock.day : phase}|`;
    for (const home of list) s += `${home.x},${home.y},${home.n},${home.mode};`;
    if (s === beeSig) return;
    const settle = beeFly && !flying && ids === beeIds && phase === "evening";
    bees.assign(list, { settle, scatter: flying && !fresh });
    beeSig = s;
    beeIds = ids;
    beeFly = flying;
    fresh = false;
    if (!motion) bees.pose();
  }

  /**
   * Read the state. Cheap enough to call after every step of the game.
   * @param {any} state
   * @param {{ selected: any, mode: any, ghost: { plot: string, x: number, y: number } | null,
   *   ghostType?: string, motion: boolean, best?: number[] | null, tending?: number }} view
   *   best: the squares (y * 6 + x) worth a clear ring; tending: the hive whose sheet is open
   */
  function sync(state, view) {
    if (!plot) return;
    if (motion !== view.motion) {
      motion = view.motion;
      beeSig = "";
      if (!motion) {
        popAt.fill(0);
        shakeAt.fill(0);
        for (const p of fx) p.on = false;
        kp.x = kp.tx;
        kp.y = kp.ty;
        kp.walking = kp.way = false;
      }
    }
    const cal = core.calendarOf(state.clock.day);
    owned = !!state.land.plots[plot]?.owned;
    wx = state.weather.today;

    let s = owned ? "o" : "x";
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const sq = core.squareAt(state, plot, x, y);
        if (sq?.t === "bed") s += `b${sq.flower}${core.stageOf(state, sq)},`;
        else if (sq?.t === "hive") s += `h${sq.id}${core.hiveById(state, sq.id)?.type},`;
        else s += ",";
      }
    for (const w of state.hives.swarms) if (w.plot === plot) s += `s${w.id}:${w.x}:${w.y}`;
    s += core.treeStageOf(state);
    if (s !== sig) {
      sig = s;
      rebuild(state);
    }

    hv = [];
    if (owned)
      for (const h of state.hives.list) {
        if (h.plot !== plot) continue;
        const cap = core.capacityOf(h) || 1;
        hv.push({
          id: h.id,
          x: h.x,
          y: h.y,
          fill: clamp(core.totalOf(h.stores) / cap, 0, 1),
          jars: Number(core.jarsIn(h)) || 0,
          badge: badgeFor(core.attentionOf(state, h) ?? []),
          raid: !!h.raid,
          ph: h.id * 1.7,
        });
      }

    glow.fill(0);
    reach.fill(0);
    pickX = pickY = -1;
    ghost = null;
    fade = 0;
    marks = false;
    const mode = view.mode;
    const sel = view.selected;
    armed = owned && (mode?.type === "plant" || mode?.type === "place");
    if (!owned) {
      // nothing to mark on land that is not yours
    } else if (mode?.type === "plant") {
      marks = true;
      for (let i = 0; i < N * N; i++)
        glow[i] = core.canPlant(state, plot, i % N, (i / N) | 0, mode.flower) === true ? 1 : 0;
    } else if (mode?.type === "place") {
      marks = true;
      const moving = mode.what === "move" ? mode.hive : 0;
      for (let i = 0; i < N * N; i++)
        glow[i] = core.canPlaceHive(state, plot, i % N, (i / N) | 0, moving) === true ? 1 : 0;
      if (view.best) for (const i of view.best) if (glow[i]) glow[i] = 2;
      if (view.ghost && view.ghost.plot === plot) {
        ghost = view.ghost;
        ghostS = hiveSprite(view.ghostType, season === 3);
        markReach(ghost.x, ghost.y);
        pickX = ghost.x;
        pickY = ghost.y;
        if (mode.what === "move") fade = mode.hive;
      }
    } else if (sel?.kind === "hive") {
      const h = core.hiveById(state, sel.id);
      if (h && h.plot === plot) {
        marks = true;
        markReach(h.x, h.y);
      }
    } else if (sel?.kind === "square" && sel.plot === plot) {
      marks = true;
      pickX = sel.x;
      pickY = sel.y;
    }

    setLook(owned && state.keeper?.made ? state.keeper : null);
    // By a hive she is looking into, she holds the smoker.
    const tended = view.tending ? core.hiveById(state, view.tending) : null;
    const rest = tended && tended.plot === plot ? (poses.get("smoker|calm") ?? kp.stand) : kp.stand;
    if (rest !== kp.rest) {
      if (kp.s === kp.rest) kp.s = rest;
      kp.rest = rest;
    }
    assignBees(state);
    life.set({ season: cal.season, weather: wx, owned, spots: blooms, dry });
    weatherSprites(wx, cal.season);
    bgDirty = dirty = true;
  }

  /**
   * The light to lay over the picture: a colour and how much of it (0..1).
   * It arrives slowly, as the hour does.
   */
  function setLight(r, g, b, a) {
    light.tr = r;
    light.tg = g;
    light.tb = b;
    light.ta = a;
    if (!light.css) stepLight(0);
  }

  function stepLight(dt) {
    const L = light;
    if (L.css && L.a === L.ta && L.r === L.tr && L.g === L.tg && L.b === L.tb) return;
    const u = !motion || !L.css || dt > 5 ? 1 : Math.min(1, dt * 1.4);
    const toward = (v, t, near) => (Math.abs(t - v) < near ? t : v + (t - v) * u);
    // A colour coming in from nothing takes its hue at once and only fades up.
    const hue = L.a < 0.004 ? 1e9 : 1.5;
    L.r = toward(L.r, L.tr, hue);
    L.g = toward(L.g, L.tg, hue);
    L.b = toward(L.b, L.tb, hue);
    L.a = toward(L.a, L.ta, 0.004);
    L.css = `rgba(${L.r | 0}, ${L.g | 0}, ${L.b | 0}, ${L.a.toFixed(3)})`;
    bgDirty = dirty = true;
  }

  // ---------------------------------------------------------------- the keeper

  function wet(ax, ay, bx, by) {
    for (let i = 1; i <= 8; i++) {
      const u = i / 8;
      if (!dry(ax + (bx - ax) * u, ay + (by - ay) * u - 0.08)) return true;
    }
    return false;
  }

  /** Walk to stand beside square (x, y). */
  function walkTo(x, y) {
    if (!kp.on) return;
    const side = kp.x < x + 0.5 ? -0.06 : 1.06;
    let tx = clamp(x + side, 0.15, 5.85);
    const ty = clamp(y + 0.97, 0.45, 5.98);
    if (!dry(tx, ty - 0.08)) {
      tx = clamp(x + 1 - side, 0.15, 5.85);
      if (!dry(tx, ty - 0.08)) return;
    }
    kp.tx = tx;
    kp.ty = ty;
    kp.way = false;
    if (!motion) {
      kp.x = tx;
      kp.y = ty;
      dirty = true;
      return;
    }
    if (wet(kp.x, kp.y, tx, ty)) {
      // Round the pond: along one side first, whichever stays dry.
      if (!wet(kp.x, kp.y, tx, kp.y) && !wet(tx, kp.y, tx, ty)) {
        kp.wx = tx;
        kp.wy = kp.y;
        kp.way = true;
      } else if (!wet(kp.x, kp.y, kp.x, ty) && !wet(kp.x, ty, tx, ty)) {
        kp.wx = kp.x;
        kp.wy = ty;
        kp.way = true;
      }
    }
  }

  function stepKeeper(dt) {
    if (kp.until && T > kp.until) {
      kp.until = 0;
      kp.s = kp.rest;
    }
    const gx = kp.way ? kp.wx : kp.tx;
    const gy = kp.way ? kp.wy : kp.ty;
    const dx = gx - kp.x;
    const dy = gy - kp.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.02) {
      if (kp.way) kp.way = false;
      else kp.walking = false;
      return;
    }
    const s = Math.min(d, dt * 2.8);
    kp.x += (dx / d) * s;
    kp.y += (dy / d) * s;
    if (Math.abs(dx) > 0.05) kp.flip = dx < 0;
    kp.walking = true;
  }

  /** Let her wear another pose for a while. */
  function mood(pose, feel, seconds) {
    const s = poses.get(`${pose}|${feel}`);
    if (!s || !kp.on) return;
    kp.s = s;
    kp.until = T + (motion ? seconds : seconds * 0.6);
    dirty = true;
  }

  // ---------------------------------------------------------------- small effects

  function spawn(kind, s, x, y, vx, vy, lifeFor, k) {
    if (!motion) return;
    for (const p of fx) {
      if (p.on) continue;
      p.on = true;
      p.kind = kind;
      p.s = s;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.t = 0;
      p.life = lifeFor;
      p.k = k;
      return;
    }
  }
  const rnd = Math.random;

  /** A thing on square (x, y) pops into place. */
  function pop(x, y) {
    if (motion) popAt[y * N + x] = 1;
    dirty = true;
  }
  /** The hive on square (x, y) shudders. */
  function shake(x, y) {
    if (motion) shakeAt[y * N + x] = 1;
  }
  /** Specks of one colour thrown up from a square. */
  function burst(x, y, color, n = 6) {
    const s = speck(color);
    for (let i = 0; i < n; i++)
      spawn(
        0,
        s,
        x + 0.5 + (rnd() - 0.5) * 0.3,
        y + 0.72,
        (rnd() - 0.5) * 2.2,
        -1.4 - rnd() * 1.5,
        0.5 + rnd() * 0.3,
        1 + rnd() * 0.6,
      );
  }
  /** A few twinkles over a square. */
  function sparkle(x, y, n = 4) {
    for (let i = 0; i < n; i++)
      spawn(
        1,
        S.twinkle,
        x + 0.5 + (rnd() - 0.5) * 0.8,
        y + 0.35 + (rnd() - 0.5) * 0.7,
        0,
        -0.15,
        0.5 + rnd() * 0.5,
        0.8 + rnd() * 0.5,
      );
  }
  /** A jar lifts out of the hive on square (x, y). */
  function lift(x, y, flower, stars) {
    /** @type {Sprite | null} */
    let s = null;
    try {
      s = art.jar(flower || "blend", stars || 0);
    } catch {
      s = null;
    }
    if (s) spawn(2, s, x + 0.5, y + 0.2, 0, -0.55, 1.3, 0.62);
    sparkle(x, y, 5);
  }
  /** The wasps round the hive on (x, y) make off. */
  function flee(x, y) {
    const s = art.wasp(0);
    for (let i = 0; i < 3; i++)
      spawn(3, s, x + 0.5, y + 0.3, (i - 1) * 1.6 + (rnd() - 0.5), -1.6 - rnd(), 0.9, 1);
  }
  /** One marker flashed on a square ("no", mostly). */
  function flash(x, y, kind = "no") {
    spawn(4, art.marker(kind), x + 0.5, y + 0.5, 0, 0, 0.55, 1);
    dirty = true;
  }

  // ---------------------------------------------------------------- drawing

  /** The ground and what lies flat on it, at the size it is shown. */
  function composeBase() {
    baseDirty = false;
    const side = Math.max(1, Math.round(geo.G * dpr));
    if (base.width !== side) base.width = base.height = side;
    basectx.setTransform(dpr, 0, 0, dpr, 0, 0);
    basectx.clearRect(0, 0, geo.G, geo.G);
    if (!gnd) return;
    basectx.drawImage(gnd.canvas, 0, 0, geo.G, geo.G);
    if (!S.soil || !owned) return;
    basectx.globalCompositeOperation = "source-atop";
    for (const b of young)
      put(
        basectx,
        S.soil,
        geo.pad + (b.x + 0.5) * geo.tile,
        geo.pad + (b.y + FEET + 0.02) * geo.tile,
        geo.k,
      );
    basectx.globalCompositeOperation = "source-over";
  }

  /** Cloud shadows: over the ground, and again over whatever stands on it. */
  function shadows(c) {
    const s = S.cloud;
    const w = geo.G * 0.66;
    const h = (w * s.h) / s.w;
    const t = motion ? T : 20;
    c.globalAlpha = 0.85;
    for (let i = 0; i < 2; i++) {
      const u = (t * 0.012 * life.wind + i * 0.56 + 0.18) % 1;
      c.drawImage(s.canvas, geo.gx - w + u * (geo.G + w), geo.gy + (0.08 + i * 0.44) * geo.G, w, h);
    }
    c.globalAlpha = 1;
  }

  function drawGround() {
    if (baseDirty) composeBase();
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.clearRect(0, 0, geo.W, geo.H);
    bgDirty = false;
    if (!gnd) return;
    bctx.drawImage(base, geo.gx, geo.gy, geo.G, geo.G);
    if (!owned) return;
    bctx.globalCompositeOperation = "source-atop";
    if (life.sky === "cloud" && S.cloud) shadows(bctx);
    if (light.a > 0.008) {
      bctx.fillStyle = light.css;
      bctx.fillRect(geo.gx, geo.gy, geo.G, geo.G);
    }
    bctx.globalCompositeOperation = "source-over";
  }

  function drawKeeper(time) {
    const s = kp.s;
    if (!s) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const k = (KEEPER_TALL * geo.tile) / STANDING;
    const x = geo.x0 + kp.x * geo.tile;
    const y = geo.y0 + kp.y * geo.tile;
    if (kp.walking) {
      kOpt.rot = (kp.flip ? -1 : 1) * 0.05;
      kOpt.flip = kp.flip;
      put(ctx, s, x, y - Math.abs(Math.sin(time * 11)) * 0.05 * geo.tile, k, kOpt);
    } else if (kp.flip) {
      kOpt.rot = 0;
      kOpt.flip = true;
      put(ctx, s, x, y, k, kOpt);
    } else put(ctx, s, x, y, k);
    draws++;
  }

  function draw(time) {
    const c = ctx;
    const { x0, y0, tile, k } = geo;
    draws = 0;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, geo.W, geo.H);
    const breath = motion ? 0.5 + 0.5 * Math.sin(time * 3) : 0.7;

    // What is lit on the ground: a soft wash where you may, a ring where it is best.
    if (marks) {
      for (let i = 0; i < N * N; i++) {
        const r = reach[i];
        const g = glow[i];
        if (!r && !g) continue;
        const cx = x0 + ((i % N) + 0.5) * tile;
        const cy = y0 + (((i / N) | 0) + 0.5) * tile;
        if (r) put(c, r === 1 ? S.near : S.far, cx, cy, k);
        else put(c, S.lawn, cx, cy, k);
        draws++;
        if (g === 2 && !ghost) {
          c.globalAlpha = 0.55 + 0.4 * breath;
          put(c, S.ok, cx, cy, k);
          c.globalAlpha = 1;
          draws++;
        }
      }
      if (pickX >= 0) {
        put(c, S.pick, x0 + (pickX + 0.5) * tile, y0 + (pickY + 0.5) * tile, k);
        draws++;
      }
    }
    // A swarm asks to be tapped.
    for (let n = 0; n < hanging.length; n++) {
      const w = hanging[n];
      c.globalAlpha = 0.5 + 0.5 * breath;
      put(c, S.pick, x0 + (w.x + 0.5) * tile, y0 + (w.y + 0.5) * tile, k * (0.96 + 0.08 * breath));
      c.globalAlpha = 1;
      draws++;
    }
    // Under the thumb.
    if (hovX >= 0 && owned) {
      const i = hovY * N + hovX;
      c.globalAlpha = 0.9;
      put(
        c,
        armed ? (glow[i] ? S.ok : S.no) : S.pick,
        x0 + (hovX + 0.5) * tile,
        y0 + (hovY + 0.5) * tile,
        k,
      );
      c.globalAlpha = 1;
      draws++;
    }

    // Small lives on the ground.
    if (life.bug.on && S.bug) {
      pOpt.rot = 0;
      pOpt.flip = life.bug.flip;
      pOpt.alpha = 1;
      put(c, S.bug, x0 + life.bug.x * tile, y0 + life.bug.y * tile, k, pOpt);
      draws++;
    }
    if (life.slug.on && S.slug) {
      pOpt.rot = 0;
      pOpt.flip = life.slug.dir < 0;
      pOpt.alpha = 1;
      put(c, S.slug, x0 + life.slug.x * tile, y0 + life.slug.y * tile, k, pOpt);
      draws++;
    }
    if (life.tit.on && S.tit0) {
      const hop = life.tit.hop > 0 ? Math.sin(life.tit.hop * Math.PI) * 0.14 : 0;
      put(
        c,
        life.tit.sing > 0 ? S.tit1 : S.tit0,
        x0 + life.tit.x * tile,
        y0 + (life.tit.y - hop) * tile,
        k,
      );
      draws++;
    }

    // Everything that stands, back row first, the keeper among it.
    const wind = motion ? life.wind * (1 + 0.3 * Math.sin(time * 0.7)) * 0.03 : 0;
    let kept = !kp.on;
    for (let n = 0; n < items.length; n++) {
      const it = items[n];
      if (!kept && it.y + FEET > kp.y) {
        drawKeeper(time);
        kept = true;
      }
      const i = it.y * N + it.x;
      const s = it.s2 && motion && ((time * 2.5) | 0) & 1 ? it.s2 : it.s;
      let sc = k * dpr;
      let fxp = x0 + (it.x + 0.5) * tile;
      const p = popAt[i];
      if (p > 0 && it.kind !== "tree" && it.kind !== "rock")
        sc *= 1 + 0.2 * Math.sin(p * Math.PI) - 0.35 * p * p;
      if (it.kind === "hive") {
        const sh = shakeAt[i];
        if (sh > 0) fxp += Math.sin(time * 46) * sh * 2.4;
      }
      const lean = it.sway
        ? (Math.sin(time * 1.5 + it.ph) + 0.4 * Math.sin(time * 3.7 + it.ph * 2)) * wind * it.sway
        : 0;
      c.setTransform(
        sc,
        0,
        -lean * sc,
        sc,
        Math.round(fxp * dpr),
        Math.round((y0 + (it.y + FEET - it.lift) * tile) * dpr),
      );
      const a =
        it.kind === "tree"
          ? it.thin || armed
            ? 0.5
            : 1
          : fade && it.id === fade && it.kind === "hive"
            ? 0.35
            : 1;
      if (a < 1) {
        c.globalAlpha = a;
        c.drawImage(s.canvas, -s.w * s.ax, -s.h * s.ay, s.w, s.h);
        c.globalAlpha = 1;
      } else c.drawImage(s.canvas, -s.w * s.ax, -s.h * s.ay, s.w, s.h);
      draws++;
    }
    if (!kept) drawKeeper(time);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (ghost && ghostS) {
      c.globalAlpha = 0.8;
      const bob = motion ? Math.sin(time * 4) * 0.03 * tile : 0;
      put(
        c,
        ghostS,
        x0 + (ghost.x + 0.5) * tile,
        y0 + (ghost.y + FEET) * tile - 0.05 * tile + bob,
        k,
      );
      c.globalAlpha = 1;
      draws++;
    }

    // The same shadows and the same light as the ground has, on all of the above.
    if (owned && (light.a > 0.008 || (life.sky === "cloud" && S.cloud))) {
      c.globalCompositeOperation = "source-atop";
      if (life.sky === "cloud" && S.cloud) shadows(c);
      if (light.a > 0.008) {
        c.fillStyle = light.css;
        c.fillRect(geo.gx - tile, 0, geo.G + 2 * tile, geo.H);
      }
      c.globalCompositeOperation = "source-over";
    }

    // Bees: on their rounds, and a few about a swarm.
    if (S.bee0) {
      const kb = Math.max(0.62, k * 0.9) * dpr;
      const fl = motion ? (time * 18) | 0 : 0;
      const b0 = S.bee0;
      const b1 = S.bee1;
      const bx = bees.x;
      const by = bees.y;
      for (let i = 0; i < bees.n; i++) {
        const a = bees.alpha[i];
        if (a < 0.03) continue;
        const s = (fl + i) & 1 ? b1 : b0;
        const d = bees.dir[i] < 0 ? -1 : 1;
        const r = bees.rot[i] * d;
        const cs = Math.cos(r) * kb;
        const sn = Math.sin(r) * kb;
        c.globalAlpha = a;
        c.setTransform(
          cs * d,
          sn * d,
          -sn,
          cs,
          (x0 + bx[i] * tile) * dpr,
          (y0 + by[i] * tile) * dpr,
        );
        c.drawImage(s.canvas, -s.w / 2, -s.h / 2, s.w, s.h);
        draws++;
      }
      c.globalAlpha = 1;
      for (let n = 0; n < hanging.length; n++) {
        const w = hanging[n];
        for (let j = 0; j < 4; j++) {
          const a = (motion ? time * (1.6 + j * 0.3) : 0) + j * 1.7 + n;
          const d = Math.sin(a) > 0 ? -1 : 1;
          c.setTransform(
            kb * d,
            0,
            0,
            kb,
            (x0 + (w.x + 0.5 + Math.cos(a) * (0.34 + j * 0.05)) * tile) * dpr,
            (y0 + (w.y + 0.42 - w.lift + Math.sin(a * 1.4 + j) * 0.3) * tile) * dpr,
          );
          const s = (fl + j) & 1 ? b1 : b0;
          c.drawImage(s.canvas, -s.w / 2, -s.h / 2, s.w, s.h);
          draws++;
        }
      }
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Wasps round a hive they are raiding.
    for (let n = 0; n < hv.length; n++) {
      const h = hv[n];
      if (!h.raid) continue;
      const w0 = art.wasp(0);
      const w1 = art.wasp(1);
      for (let j = 0; j < 3; j++) {
        const a = (motion ? time * 3.4 : 0) + j * 2.09 + h.ph;
        pOpt.rot = 0;
        pOpt.flip = Math.sin(a) > 0;
        pOpt.alpha = 1;
        put(
          c,
          motion && (((time * 16) | 0) + j) & 1 ? w1 : w0,
          x0 + (h.x + 0.5 + Math.cos(a) * 0.44) * tile,
          y0 + (h.y + 0.3 + Math.sin(a * 1.3 + j) * 0.24) * tile,
          Math.max(0.8, k * 1.1),
          pOpt,
        );
        draws++;
      }
    }

    // Butterflies.
    for (let n = 0; n < life.flies.length; n++) {
      const b = life.flies[n];
      if (!b.on) continue;
      const flap = !motion ? 0 : b.t < 1 ? (time * 9) | 0 : (time * 1.3 + n) | 0;
      const s = flap & 1 ? S[`fly${b.kind}1`] : S[`fly${b.kind}0`];
      if (!s) continue;
      pOpt.rot = b.t < 1 ? b.rot : b.rot * 0.3;
      pOpt.flip = false;
      pOpt.alpha = 1;
      put(c, s, x0 + b.x * tile, y0 + b.y * tile, Math.max(0.7, k), pOpt);
      draws++;
    }

    // What each hive wears: its stores across its foot, one badge, a twinkle
    // when a jar is ready.
    const km = clamp((0.96 * tile) / METER_W, 0.9, 1.3);
    for (let n = 0; n < hv.length; n++) {
      const h = hv[n];
      const cx = x0 + (h.x + 0.5) * tile;
      const cy = y0 + (h.y + FEET - 0.04) * tile;
      put(c, S.back, cx, cy, km);
      draws++;
      if (h.fill > 0.02) {
        const f = S.fill;
        c.drawImage(
          f.canvas,
          0,
          0,
          Math.max(1, f.canvas.width * h.fill),
          f.canvas.height,
          cx - (FILL_W / 2) * km,
          cy - (FILL_H / 2) * km - 0.3 * km,
          FILL_W * km * h.fill,
          FILL_H * km,
        );
        draws++;
      }
      if (h.badge) {
        const bob = motion ? Math.sin(time * 2.6 + h.ph) * 0.03 * tile : 0;
        put(c, h.badge, cx + 0.31 * tile, y0 + (h.y + 0.14) * tile + bob, Math.max(0.9, k * 1.05));
        draws++;
      }
      if (h.jars >= 1) {
        const tw = motion ? 0.5 + 0.5 * Math.sin(time * 2.2 + h.ph) : 0.9;
        c.globalAlpha = 0.35 + 0.65 * tw;
        put(c, S.twinkle, cx - 0.3 * tile, y0 + (h.y + 0.1) * tile, k * (0.9 + 0.5 * tw));
        c.globalAlpha = 1;
        draws++;
      }
    }

    // Specks, twinkles, a jar on its way up.
    for (let n = 0; n < FX; n++) {
      const p = fx[n];
      if (!p.on || !p.s) continue;
      const u = p.t / p.life;
      const px = x0 + p.x * tile;
      const py = y0 + p.y * tile;
      if (p.kind === 1) {
        const g = Math.sin(u * Math.PI);
        c.globalAlpha = g;
        put(c, p.s, px, py, k * p.k * (0.5 + g));
      } else if (p.kind === 3) {
        pOpt.rot = 0;
        pOpt.flip = p.vx < 0;
        pOpt.alpha = u > 0.6 ? (1 - u) / 0.4 : 1;
        put(c, p.s, px, py, Math.max(0.7, k), pOpt);
      } else if (p.kind === 4) {
        c.globalAlpha = 1 - u;
        put(c, p.s, px, py, k);
      } else {
        c.globalAlpha = u < 0.12 ? u / 0.12 : u > 0.7 ? (1 - u) / 0.3 : 1;
        put(c, p.s, px, py, k * p.k);
      }
      c.globalAlpha = 1;
      draws++;
    }

    if (owned) weather(c, motion ? time : 3.7);
  }

  /** What falls and blows over everything. Still (but there) when motion is off. */
  function weather(c, time) {
    const { tile, k } = geo;
    const top = geo.gy - 0.6 * tile;
    const fall = geo.G + 0.9 * tile;
    if (life.sky === "rain" && S.rain) {
      const r = life.rain;
      const kr = Math.max(1, k * 1.25);
      if (motion && S.ripple)
        for (let i = 0; i < 9; i++) {
          const v = time * 1.5 + i * 0.37;
          const u = v - Math.floor(v);
          const seed = Math.floor(v) * 9 + i;
          c.globalAlpha = (1 - u) * 0.75;
          put(
            c,
            S.ripple,
            geo.gx + (0.06 + scatter(seed) * 0.88) * geo.G,
            geo.gy + (0.08 + scatter(seed + 0.5) * 0.86) * geo.G,
            k * (0.35 + u * 0.9),
          );
        }
      for (let i = 0; i < r.n; i++) {
        const v = (r.y[i] + time * r.s[i]) % 1;
        c.globalAlpha = 0.5 + (i % 3) * 0.2;
        put(
          c,
          S.rain,
          geo.gx + (r.x[i] * 1.16 - 0.04 - v * 0.12) * geo.G,
          top + v * fall,
          kr * (0.85 + (i % 4) * 0.16),
        );
      }
      c.globalAlpha = 1;
      draws += r.n;
    } else if (life.sky === "snow" && S.snow) {
      const r = life.snow;
      for (let i = 0; i < r.n; i++) {
        const v = (r.y[i] + time * r.s[i]) % 1;
        c.globalAlpha = 0.65 + (i % 3) * 0.17;
        put(
          c,
          S.snow,
          geo.gx + (r.x[i] * 1.06 - 0.03 + Math.sin(time * 0.9 + i) * 0.02) * geo.G,
          top + v * fall,
          Math.max(0.8, k) * (0.7 + (i % 4) * 0.22),
        );
      }
      c.globalAlpha = 1;
      draws += r.n;
    } else if (wx === "windy" && motion && S.leafA) {
      for (let i = 0; i < 8; i++) {
        const v = time * (0.3 + (i % 3) * 0.07) + i * 0.29;
        const u = v - Math.floor(v);
        const row = scatter(Math.floor(v) * 8 + i);
        c.globalAlpha = u < 0.1 ? u * 10 : u > 0.85 ? (1 - u) / 0.15 : 1;
        put(
          c,
          i & 1 ? S.leafA : S.leafB,
          geo.gx + (u * 1.2 - 0.1) * geo.G,
          geo.gy + (0.05 + row * 0.85 + Math.sin(u * 9 + i) * 0.03) * geo.G,
          Math.max(1, k * 1.3),
        );
      }
      c.globalAlpha = 1;
      draws += 8;
    } else if (wx === "frost" && S.twinkle) {
      for (let i = 0; i < 7; i++) {
        const tw = motion ? 0.5 + 0.5 * Math.sin(time * 1.3 + i * 2.1) : i % 2;
        if (tw < 0.08) continue;
        c.globalAlpha = tw * 0.9;
        put(
          c,
          S.twinkle,
          geo.gx + (0.08 + scatter(i + 3) * 0.84) * geo.G,
          geo.gy + (0.08 + scatter(i + 11) * 0.84) * geo.G,
          k * (0.6 + 0.5 * tw),
        );
      }
      c.globalAlpha = 1;
      draws += 7;
    }
  }

  /**
   * One frame: move what moves, then draw.
   * @param {number} dt seconds since the last frame
   */
  function frame(dt) {
    fresher();
    if (!geo.W || !plot) return;
    T += dt;
    stepLight(dt);
    if (motion) {
      bees.step(dt, T, pace);
      life.step(dt, T);
      stepKeeper(dt);
      for (let i = 0; i < N * N; i++) {
        if (popAt[i] > 0) popAt[i] = Math.max(0, popAt[i] - dt * 2.6);
        if (shakeAt[i] > 0) shakeAt[i] = Math.max(0, shakeAt[i] - dt * 1.6);
      }
      for (let n = 0; n < FX; n++) {
        const p = fx[n];
        if (!p.on) continue;
        p.t += dt;
        if (p.t >= p.life) {
          p.on = false;
          continue;
        }
        if (p.kind === 0) p.vy += 7 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    } else {
      if (kp.until && T > kp.until) {
        kp.until = 0;
        kp.s = kp.rest;
        dirty = true;
      }
      if (!dirty && !bgDirty) return;
    }
    if (bgDirty || (motion && life.sky === "cloud" && owned)) drawGround();
    draw(T);
    dirty = false;
  }

  // ---------------------------------------------------------------- where things are

  /** Whether item `it` is painted at point (px, py) of the canvas: what the eye would say. */
  function covers(it, px, py) {
    const s = it.s;
    const lx = (px - (geo.x0 + (it.x + 0.5) * geo.tile)) / geo.k + s.w * s.ax;
    const ly = (py - (geo.y0 + (it.y + FEET - it.lift) * geo.tile)) / geo.k + s.h * s.ay;
    if (lx < 0 || ly < 0 || lx >= s.w || ly >= s.h) return false;
    const per = s.canvas.width / s.w;
    const span = Math.max(1, Math.round(5 * per)); // a fingertip's worth, averaged
    pctx.clearRect(0, 0, 1, 1);
    pctx.drawImage(
      s.canvas,
      Math.round(lx * per - span / 2),
      Math.round(ly * per - span / 2),
      span,
      span,
      0,
      0,
      1,
      1,
    );
    return pctx.getImageData(0, 0, 1, 1).data[3] > 70;
  }

  /**
   * The square a point of the page belongs to, or null if it is off the
   * meadow. A bed, a hive or a swarm that is painted over the point wins it,
   * even where it pokes up into the square behind: the tap goes to what the
   * eye sees. (Trees and rocks only ever answer for their own square.)
   */
  function squareAt(clientX, clientY) {
    fresher();
    if (!geo.W) return null;
    const r = fg.getBoundingClientRect();
    const px = clientX - r.left;
    const py = clientY - r.top;
    const fxs = (px - geo.x0) / geo.tile;
    const fys = (py - geo.y0) / geo.tile;
    if (fxs < -0.35 || fys < -0.5 || fxs > N + 0.35 || fys > N + 0.35) return null;
    const x = clamp(Math.floor(fxs), 0, N - 1);
    const y = clamp(Math.floor(fys), 0, N - 1);
    for (let d = 2; d >= 1; d--) {
      if (y + d >= N) continue;
      for (let n = items.length - 1; n >= 0; n--) {
        const it = items[n];
        if (it.x !== x || it.y !== y + d || it.kind === "tree" || it.kind === "rock") continue;
        if (covers(it, px, py)) return { x, y: y + d };
      }
    }
    return { x, y };
  }

  /** Show which square the thumb is on (page coordinates), or pass nothing to let go. */
  function hover(clientX, clientY) {
    const q = clientX === undefined ? null : squareAt(clientX, clientY);
    const x = q ? q.x : -1;
    const y = q ? q.y : -1;
    if (x === hovX && y === hovY) return;
    hovX = x;
    hovY = y;
    dirty = true;
  }

  /** Square (x, y) on the page. */
  function squareRect(x, y) {
    fresher();
    if (!geo.W) return null;
    const r = fg.getBoundingClientRect();
    return {
      x: r.left + globalThis.scrollX + geo.x0 + x * geo.tile,
      y: r.top + globalThis.scrollY + geo.y0 + y * geo.tile,
      width: geo.tile,
      height: geo.tile,
    };
  }

  function destroy() {
    dead = true;
    watcher.disconnect();
    clearTimeout(regrind);
    clearTimeout(warming);
  }

  return {
    geo,
    prepare,
    show,
    sync,
    frame,
    setLight,
    squareAt,
    squareRect,
    hover,
    walkTo,
    mood,
    pop,
    shake,
    burst,
    sparkle,
    lift,
    flee,
    flash,
    /** For a device that cannot keep up: paint on a coarser canvas. */
    soften() {
      fine = 1.5;
      stale = true;
    },
    /** The next flight starts from the hives (a day has just begun). */
    dawn() {
      fresh = true;
    },
    /** @param {number} p how fast the bees' day runs (1 = normal) */
    setPace(p) {
      pace = p;
    },
    get plot() {
      return plot;
    },
    /** True while something on the canvas is still settling with motion off. */
    get waiting() {
      return dirty || bgDirty || stale;
    },
    beeCount: () => bees.count(),
    beesOut: () => bees.flying(),
    /** Where the bees you can see are, in squares: x, y, x, y… (for the tests). */
    beesAt() {
      const out = [];
      for (let i = 0; i < bees.n; i++)
        if (bees.alpha[i] > 0.05) out.push(+bees.x[i].toFixed(3), +bees.y[i].toFixed(3));
      return out;
    },
    draws: () => draws,
    destroy,
  };
}
