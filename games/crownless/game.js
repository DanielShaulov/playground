/**
 * Crownless — M1, the battle sandbox (Skirmish).
 *
 * Pick two armies, deploy, and fight in planned rounds: give standing orders
 * from the bar at the bottom, press Go, watch three seconds, repeat. The
 * rules live in rules/ (pure; Node runs them), the drawing in view/. This
 * file wires them to the shell, the save and your thumb.
 *
 * The save (`playground:crownless:save`) is the whole battle as the rules
 * keep it. A round is computed and saved before it is shown, so closing the
 * app mid-animation can't buy a second try (tech.md §4).
 */
import { createLoop, createInput, vibrate } from "../../shared/engine.js";
import { createShell } from "../../shared/ui.js";
import { createStore } from "../../shared/storage.js";
import {
  playRound,
  useAbility,
  cannotUse,
  retreat,
  autoFinish,
  aftermath,
  setFormation,
  standing,
  ABILITIES,
  alive,
  FIELD_W,
  FIELD_H,
} from "./rules/battle.js";
import { give } from "./rules/battle-ai.js";
import {
  skirmish,
  applyPreset,
  placeSquad,
  oddsRun,
  summarizeOdds,
  strength,
  DOCTRINES,
} from "./rules/battle-setup.js";
import { worthOf, troop, CULTURES } from "./rules/data/troops.js";
import { layout, toField, squadAt, barHeight } from "./view/layout.js";
import { createBattleView } from "./view/battle-view.js";
import {
  h,
  titleSheet,
  setupSheet,
  commandBar,
  moreSheet,
  resultSheet,
  troopList,
} from "./view/sheets.js";
import { sideLook, squadName } from "./view/theme.js";
import { readSave, makeSave } from "./rules/save.js";

const shell = createShell({ title: "Crownless" });
const { stage } = shell;
const ctx = stage.ctx;
const store = createStore("crownless");
const stageEl = stage.canvas.parentElement;

// The HUD is read-only (ui.md §1): this game writes its own status line.
const hudEl = shell.root.querySelector(".hud");
const hudLeft = h("div", { class: "cl-hud" });
const hudRight = h("div", { class: "cl-hud" });
hudEl.insertBefore(hudLeft, hudEl.querySelector(".spacer"));
hudEl.append(hudRight);

const ui = h("div", { class: "cl-ui" });
stageEl.append(ui);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const DEFAULT_SETUP = {
  terrain: "open",
  sides: [
    { culture: "vale", doctrine: "balanced", worth: 100, hero: 5 },
    { culture: "fen", doctrine: "yeomen", worth: 100, hero: 5 },
  ],
};

let scene = "title"; // title | setup | battle
let b = null; // the battle being fought: exactly what the rules and the save hold
let phase = "deploy"; // deploy | plan | play | over
let shown = null; // {setup, odds} the battle was started from
let result = null; // what the result sheet shows, once over
let setup = loadSetup();
let editing = 0;
let preview = null; // the setup as a battle, for the sheet and the odds
let oddsJob = null; // {runs, base, done}
let sel = new Set(); // your selected squads
let mode = "squads"; // squads | target
let sheet = null; // null | "more"
let retreatArmed = false;
let continuous = false;
let settings = { camera: "fit", ...store.get("settings", {}) };
let toast = null;
let tip = null;
let demo = null; // the battle behind the title
let cam = { x: 50, y: 70 };
let elapsed = 0;

const view = createBattleView({
  onImpact(kind, e) {
    if (scene !== "battle") return;
    if (kind === "charge" || (kind === "rout" && b.squads[e.id]?.side === 0))
      vibrate(kind === "rout" ? 20 : 12);
  },
});

function loadSetup() {
  const s = store.get("setup", null);
  if (!s?.sides?.length) return structuredClone(DEFAULT_SETUP);
  return s;
}

const loadSave = () => readSave(store.get("save", null));

/** Save the battle as the rules left it — before any animation of it. */
function persist() {
  if (!b) return;
  store.set(
    "save",
    makeSave({
      setup: shown.setup,
      odds: shown.odds,
      phase: b.over ? "over" : phase === "play" ? "plan" : phase,
      battle: b,
      result,
    }),
  );
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

function toTitle() {
  scene = "title";
  sheet = null;
  newDemo();
  render();
}

function newDemo() {
  const cultures = Object.keys(CULTURES);
  const docs = Object.keys(DOCTRINES);
  const r = () => Math.floor(Math.random() * 1e9);
  demo = skirmish({
    seed: r(),
    terrain: Math.random() < 0.5 ? "woods" : "open",
    sides: [0, 1].map(() => ({
      culture: cultures[r() % 4],
      doctrine: docs[r() % docs.length],
      worth: 80,
      hero: 0,
      ai: true,
    })),
  });
  view.setBattle(demo);
}

function toSetup() {
  scene = "setup";
  setup.seed = (Math.random() * 2 ** 32) >>> 0;
  rebuildPreview();
  render();
}

function rebuildPreview() {
  preview = skirmish(setup);
  view.setBattle(preview);
  oddsJob = { runs: [], base: JSON.stringify(preview), done: null };
}

function startBattle(fromSetup) {
  setup = fromSetup;
  store.set("setup", { terrain: setup.terrain, sides: setup.sides });
  finishOdds();
  b = skirmish(setup);
  shown = { setup: structuredClone(setup), odds: oddsJob.done };
  phase = "deploy";
  result = null;
  sel = new Set();
  mode = "squads";
  sheet = null;
  continuous = false;
  scene = "battle";
  view.setBattle(b);
  persist();
  render();
}

function resume(s) {
  b = s.battle;
  shown = { setup: s.setup, odds: s.odds };
  phase = s.phase;
  result = s.result ?? null;
  sel = new Set();
  mode = "squads";
  sheet = null;
  scene = "battle";
  view.setBattle(b);
  if (phase === "over" && !result) finishBattle();
  render();
}

function finishOdds() {
  if (!oddsJob) rebuildPreview();
  while (oddsJob.runs.length < 8)
    oddsJob.runs.push(oddsRun(preview, oddsJob.runs.length, oddsJob.base));
  oddsJob.done = summarizeOdds(oddsJob.runs);
}

/** One auto-resolve a frame, so working out the odds never stalls the phone. */
function stepOdds() {
  if (scene !== "setup" || !oddsJob || oddsJob.done) return;
  oddsJob.runs.push(oddsRun(preview, oddsJob.runs.length, oddsJob.base));
  if (oddsJob.runs.length >= 8) {
    oddsJob.done = summarizeOdds(oddsJob.runs);
    render();
  }
}

// ---------------------------------------------------------------------------
// Battle actions
// ---------------------------------------------------------------------------

const mine = () => b.squads.filter((s) => s.side === 0 && standing(s));

/** Who an order goes to: the selection, or every squad but the banner. */
function orderees() {
  const list = sel.size
    ? [...sel]
    : mine()
        .filter((s) => !s.banner)
        .map((s) => s.id);
  return list.filter((id) => standing(b.squads[id]));
}

function onOrder(kind) {
  const ids = orderees();
  if (!ids.length) return;
  give(b, 0, ids, { kind });
  mode = kind === "advance" || kind === "charge" ? "target" : "squads";
  persist();
  render();
}

function onTarget(id) {
  const ids = orderees();
  const kind = commonKind(ids) === "charge" ? "charge" : "advance";
  give(b, 0, ids, { kind, target: id });
  mode = "squads";
  persist();
  render();
}

function commonKind(ids) {
  const kinds = new Set(ids.map((id) => b.squads[id].cmd?.kind));
  return kinds.size === 1 ? [...kinds][0] : null;
}

function onGo() {
  if (phase === "deploy") {
    phase = "plan";
    sel = new Set();
    persist();
    render();
    return;
  }
  if (phase === "play") {
    view.skip();
    return;
  }
  if (phase !== "plan") return;
  sheet = null;
  mode = "squads";
  const tl = playRound(b);
  lastEvents = tl.events;
  if (b.over) finishBattle();
  persist(); // the outcome is saved before a frame of it is shown
  view.play(tl);
  phase = "play";
  render();
}

let lastEvents = [];

/** After the animation: pause for anything that needs you (battle.md §1). */
function roundShown() {
  phase = b.over ? "over" : "plan";
  for (const id of [...sel]) if (!standing(b.squads[id])) sel.delete(id);
  const why = pauseFor(lastEvents);
  if (why) say(why);
  if (b.over) {
    continuous = false;
    vibrate(30);
  }
  render();
  if (continuous && !b.over && !why)
    setTimeout(() => phase === "plan" && continuous && onGo(), 350);
}

function pauseFor(events) {
  const name = (id) => {
    const s = b.squads[id];
    return s.banner ? "Your banner" : squadName(s, troop);
  };
  for (const e of events) {
    const s = e.id != null ? b.squads[e.id] : null;
    if (e.k === "heroDown" && e.side === 0) return "Your banner has fallen";
    if (e.k === "rout" && s?.side === 0) return `${name(e.id)} routs`;
    if (e.k === "waver" && s?.side === 0) return `${name(e.id)} wavers`;
    if (e.k === "horseOn")
      return `Their horse turns on your ${squadName(b.squads[e.target], troop).toLowerCase()}`;
    if (e.k === "ammoOut" && s?.side === 0) return `${name(e.id)}: out of arrows`;
    if (e.k === "afford" && e.side === 0)
      return `Valor for ${e.abilities.map((a) => abilityName(a)).join(", ")}`;
    if (e.k === "moveDone" && s?.side === 0) return `${name(e.id)} is in position`;
  }
  return null;
}

const abilityName = (id) => ABILITIES[id].name;

function onAbility(id) {
  const squad = [...sel][0] ?? null;
  const why = useAbility(b, 0, id, squad);
  if (why) say(why);
  persist();
  render();
}

function finishBattle() {
  const after = aftermath(b, { worthOf });
  const sum = (m) => Object.values(m).reduce((a, c) => a + c, 0);
  const sides = [0, 1].map((side) => {
    const r = after[side];
    let fielded = 0;
    for (const s of b.squads)
      if (s.side === side) for (const u of s.units) if (!troop(u.type).hero) fielded += u.n0;
    return {
      fielded,
      killed: sum(r.killed),
      wounded: sum(r.wounded),
      fled: sum(r.fled),
      captured: sum(r.captured),
    };
  });
  let record = null;
  const odds = shown.odds;
  if (b.winner === 0 && odds) {
    const best = store.get("best", null);
    if (!best || odds.wins < best.wins) {
      const [y, t] = shown.setup.sides;
      const label = `${CULTURES[y.culture].name} ${docName(y.doctrine)} v ${CULTURES[t.culture].name} ${docName(t.doctrine)}`;
      store.set("best", { wins: odds.wins, word: odds.word, label });
      record = `Your toughest win yet: ${odds.word} (${odds.wins} of 8).`;
    }
  }
  result = {
    winner: b.winner,
    rounds: b.round,
    retreated: b.retreated,
    sides,
    aftermath: after,
    record,
  };
}

const docName = (d) => (d === "random" ? "Random" : DOCTRINES[d].name);

// ---------------------------------------------------------------------------
// Taps on the field
// ---------------------------------------------------------------------------

function currentLayout() {
  const follow = scene === "battle" && settings.camera === "follow";
  return layout(stage.width, stage.height, follow ? { follow: cam, zoom: 2.5 } : {});
}

function squadsOnField() {
  return b.squads
    .filter((s) => alive(s) && view.at(s.id).n > 0)
    .map((s) => ({ s, at: view.at(s.id) }));
}

function tapField(px, py) {
  if (scene !== "battle") return;
  if (sheet) {
    // Tapping the field above a sheet closes it (ui.md §1, rule 5).
    sheet = null;
    retreatArmed = false;
    render();
    return;
  }
  if (phase !== "plan" && phase !== "deploy") return;
  const L = currentLayout();
  if (py >= L.viewH) return;
  const hit = squadAt(L, squadsOnField(), px, py);
  if (hit && hit.side === 0) {
    if (hit.state === "routing") return;
    sel = sel.size === 1 && sel.has(hit.id) ? new Set() : new Set([hit.id]);
    mode = "squads";
    render();
    return;
  }
  if (hit && hit.side === 1) {
    if (phase === "deploy" || hit.state === "routing") return;
    onTarget(hit.id);
    return;
  }
  if (!sel.size) return;
  // Open ground: the selection goes there, keeping its shape.
  const f = toField(L, px, py);
  const ids = [...sel];
  const cx = ids.reduce((m, id) => m + b.squads[id].x, 0) / ids.length;
  const cy = ids.reduce((m, id) => m + b.squads[id].y, 0) / ids.length;
  for (const id of ids) {
    const s = b.squads[id];
    const x = Math.max(3, Math.min(FIELD_W - 3, f.x + s.x - cx));
    const y = Math.max(3, Math.min(FIELD_H - 3, f.y + s.y - cy));
    if (phase === "deploy") placeSquad(b, id, x, y);
    else give(b, 0, [id], { kind: "move", x, y });
  }
  persist();
  render();
}

/** A long press shows what a squad is; it never acts (ui.md §1, rule 3). */
function showTip(px, py) {
  if (scene !== "battle" && scene !== "setup") return;
  const battle = scene === "battle" ? b : preview;
  const L = currentLayout();
  const list = battle.squads.filter(alive).map((s) => ({ s, at: view.at(s.id) }));
  const s = squadAt(L, list, px, py);
  if (!s) return;
  tip = h(
    "div",
    {
      class: "cl-tip",
      style: { left: `${Math.min(px, stage.width - 230)}px`, top: `${Math.max(4, py - 90)}px` },
    },
    squadCard(battle, s),
  );
  ui.append(tip);
  vibrate(8);
}

/** What a long press on a squad says, on the field or on its chip. */
function squadCard(battle, s) {
  const units = s.units.filter((u) => u.n > 0).map((u) => `${u.n} ${troop(u.type).name}`);
  const order = describeOrder(battle, s);
  return [
    h("b", {}, units.join(" · ")),
    h(
      "div",
      {},
      `morale ${Math.max(0, Math.round(s.morale))} of ${Math.round(s.cap)} · ${s.state}`,
    ),
    s.ammo0 ? h("div", {}, `${s.ammo} volleys left`) : null,
    order ? h("div", {}, order) : null,
  ];
}

/**
 * A long press on a button says what it does, and never presses it: the
 * click that ends the press is swallowed, tip or not. A chip says what its
 * squad is.
 */
function showButtonTip(el) {
  let body;
  if (el.dataset.squad == null && el.dataset.tip == null) return;
  if (el.dataset.squad != null) {
    const s = (scene === "battle" ? b : preview)?.squads[Number(el.dataset.squad)];
    if (!s) return;
    body = squadCard(scene === "battle" ? b : preview, s);
  } else {
    const text = el.dataset.tip;
    const at = text.indexOf(": ");
    body = at > 0 ? [h("b", {}, text.slice(0, at)), h("div", {}, text.slice(at + 2))] : text;
  }
  hideTip();
  tip = h("div", { class: "cl-tip" }, body);
  ui.append(tip);
  // Above the button, or below it when there's no room above.
  const box = stageEl.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const left = r.left - box.left + r.width / 2 - tip.offsetWidth / 2;
  let top = r.top - box.top - tip.offsetHeight - 8;
  if (top < 4) top = r.bottom - box.top + 8;
  tip.style.left = `${Math.max(4, Math.min(box.width - tip.offsetWidth - 4, left))}px`;
  tip.style.top = `${top}px`;
  vibrate(8);
}

let held = null;
let swallowClick = false;
ui.addEventListener("pointerdown", (e) => {
  const el = e.target.closest("button, [data-tip]");
  if (!el) return;
  const me = { x: e.clientX, y: e.clientY, shown: false };
  me.timer = setTimeout(() => {
    me.shown = true;
    showButtonTip(el);
  }, 400);
  held = me;
});
ui.addEventListener("pointermove", (e) => {
  if (held && !held.shown && Math.hypot(e.clientX - held.x, e.clientY - held.y) > 10) letGo();
});
function letGo() {
  if (!held) return;
  clearTimeout(held.timer);
  if (held.shown) {
    hideTip();
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 400);
  }
  held = null;
}
ui.addEventListener("pointerup", letGo);
ui.addEventListener("pointercancel", letGo);
ui.addEventListener(
  "click",
  (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  },
  true,
);
ui.addEventListener("contextmenu", (e) => e.preventDefault());

function describeOrder(battle, s) {
  const o = s.order;
  const t = o.target != null ? battle.squads[o.target] : null;
  const what = t ? `${t.side === s.side ? "" : "their "}${squadName(t, troop).toLowerCase()}` : "";
  if (s.contacts.length) return "fighting";
  if (o.kind === "hold") return "holding";
  if (o.kind === "move") return o.withdraw ? "falling back" : "moving";
  if (o.kind === "kite") return `skirmishing round ${what}`;
  if (t) return `${o.kind === "charge" ? "charging" : "advancing on"} ${what}`;
  return null;
}

function hideTip() {
  tip?.remove();
  tip = null;
}

let press = null;
createInput(stage, {
  onDown(p) {
    press = { ...p, timer: setTimeout(() => showTip(p.x, p.y), 400) };
  },
  onMove(p) {
    if (press && Math.hypot(p.x - press.x, p.y - press.y) > 10) clearTimeout(press.timer);
  },
  onUp() {
    if (press) clearTimeout(press.timer);
    press = null;
    hideTip();
  },
  onTap({ x, y }) {
    tapField(x, y);
  },
});

function say(text) {
  // Long enough to read: a couple of seconds, more for a longer line.
  toast = { text, life: Math.max(2.2, text.length / 18) };
}

// ---------------------------------------------------------------------------
// Rendering the DOM
// ---------------------------------------------------------------------------

function render() {
  const chipsScroll = ui.querySelector(".cl-chips")?.scrollLeft ?? 0;
  ui.replaceChildren();
  renderHud();
  if (scene === "title") {
    const s = loadSave();
    ui.append(
      titleSheet({
        canContinue: !!s && s.phase !== "over",
        continueText:
          s?.phase === "deploy"
            ? "Continue — deploying"
            : `Continue — round ${(s?.battle?.round ?? 0) + 1}`,
        best: store.get("best", null),
        nudge: !(matchMedia("(display-mode: standalone)").matches || navigator.standalone),
        onContinue: () => resume(loadSave()),
        onSkirmish: toSetup,
      }),
    );
    return;
  }
  if (scene === "setup") {
    const p = [0, 1].map((side) => {
      const st = strength(preview, side);
      const troops = {};
      for (const s of preview.squads)
        if (s.side === side)
          for (const u of s.units)
            if (!troop(u.type).hero) troops[u.type] = (troops[u.type] ?? 0) + u.n;
      return { ...st, list: troopList(troops) };
    });
    ui.append(
      setupSheet({
        setup,
        editing,
        preview: p,
        odds: oddsJob?.done,
        onEdit: (i) => {
          editing = i;
          render();
        },
        onChange: (side, k, v) => {
          if (side == null) setup[k] = v;
          else setup.sides[side][k] = v;
          rebuildPreview();
          render();
        },
        onBack: toTitle,
        onDeploy: () => startBattle(setup),
      }),
    );
    return;
  }
  // The battle.
  const squads = mine().sort((a, c) => (a.banner ? 1 : 0) - (c.banner ? 1 : 0) || a.x - c.x);
  const ids = orderees();
  const sd = b.sides[0];
  const first = [...sel][0] ?? null;
  const abilities = (sd.hero?.abilities ?? []).map((id) => {
    const why = cannotUse(b, 0, id, first);
    return { id, ready: !why, why, used: sd.pending.some((p) => p.id === id) };
  });
  const centre = ids.length
    ? {
        x: ids.reduce((m, id) => m + b.squads[id].x, 0) / ids.length,
        y: ids.reduce((m, id) => m + b.squads[id].y, 0) / ids.length,
      }
    : { x: 50, y: 110 };
  const enemies = b.squads
    .filter((s) => s.side === 1 && standing(s))
    .map((s) => ({ s, d: Math.hypot(s.x - centre.x, s.y - centre.y) }))
    .sort((a, c) => a.d - c.d);
  const targetOf = (() => {
    const t = new Set(ids.map((id) => b.squads[id].cmd?.target ?? null));
    return t.size === 1 ? [...t][0] : null;
  })();
  ui.append(
    commandBar({
      height: barHeight(),
      phase,
      mode,
      squads,
      selected: sel,
      allSelected: sel.size > 0 && squads.filter((s) => !s.banner).every((s) => sel.has(s.id)),
      enemies,
      targetOf,
      current: phase === "deploy" ? null : commonKind(ids),
      preset: sd.preset,
      abilities,
      continuous,
      progress: 0,
      onAll: () => {
        const all = squads.filter((s) => !s.banner).map((s) => s.id);
        sel = sel.size === all.length && all.every((id) => sel.has(id)) ? new Set() : new Set(all);
        render();
      },
      onChip: (id) => {
        sel = sel.size === 1 && sel.has(id) ? new Set() : new Set([id]);
        render();
      },
      onTarget,
      onTargetAny: () => {
        const ids2 = orderees();
        give(b, 0, ids2, {
          kind: commonKind(ids2) === "charge" ? "charge" : "advance",
          target: null,
        });
        mode = "squads";
        persist();
        render();
      },
      onTargetDone: () => {
        mode = "squads";
        render();
      },
      onOrder,
      onPreset: (id) => {
        applyPreset(b, 0, id);
        persist();
        render();
      },
      onMore: () => {
        sheet = "more";
        retreatArmed = false;
        render();
      },
      onAbility,
      onContinuous: () => {
        continuous = !continuous;
        render();
        if (continuous && phase === "plan") onGo();
      },
      onGo,
    }),
  );
  const scroller = ui.querySelector(".cl-chips");
  if (scroller) scroller.scrollLeft = chipsScroll;
  if (sheet === "more") {
    const chosen = ids.filter(() => sel.size).map((id) => b.squads[id]);
    ui.append(
      moreSheet({
        phase,
        squads: chosen,
        title:
          chosen.length === 1
            ? chosen[0].banner
              ? "Your banner"
              : squadName(chosen[0], troop)
            : "",
        camera: settings.camera,
        retreatArmed,
        onFormation: (f) => {
          for (const s of chosen) setFormation(b, s.id, f);
          persist();
          render();
        },
        onFire: (f) => {
          for (const s of chosen) s.cmd && (s.cmd.fire = f === "hold" ? "hold" : undefined);
          persist();
          render();
        },
        onSkirmish: () => {
          give(
            b,
            0,
            chosen.map((s) => s.id),
            { kind: "skirmish" },
          );
          sheet = null;
          persist();
          render();
        },
        onCycle: (v) => {
          for (const s of chosen) s.cmd && (s.cmd.cycle = v !== "off");
          persist();
          render();
        },
        onCamera: (v) => {
          settings.camera = v;
          store.set("settings", settings);
          render();
        },
        onBack: () => {
          sheet = null;
          render();
        },
        onRetreat: () => {
          if (!retreatArmed) {
            retreatArmed = true;
            render();
            return;
          }
          retreat(b, 0, worthOf);
          finishBattle();
          phase = "over";
          sheet = null;
          persist();
          render();
        },
        onAuto: () => {
          autoFinish(b);
          finishBattle();
          phase = "over";
          sheet = null;
          view.setBattle(b);
          persist();
          render();
        },
      }),
    );
  }
  if (phase === "over" && result) {
    const won = result.winner === 0;
    const heading =
      result.winner == null
        ? "Draw"
        : won
          ? "Victory"
          : result.retreated === 0
            ? "Retreat"
            : "Defeat";
    const odds = shown.odds;
    ui.append(
      resultSheet({
        heading,
        sub: `${result.rounds} round${result.rounds === 1 ? "" : "s"}${odds ? ` · the odds were ${odds.word} (${odds.wins} of 8)` : ""}`,
        sides: result.sides.map((s, i) => ({ ...s, name: i === 0 ? "You" : "Them" })),
        record: result.record,
        onTitle: () => {
          store.clear("save");
          toTitle();
        },
        onNew: () => {
          store.clear("save");
          toSetup();
        },
        onRematch: () => {
          const again = structuredClone(shown.setup);
          again.seed = (Math.random() * 2 ** 32) >>> 0;
          setup = again;
          oddsJob = null;
          preview = skirmish(again);
          oddsJob = { runs: [], base: JSON.stringify(preview), done: null };
          startBattle(again);
        },
      }),
    );
  }
}

function renderHud() {
  hudLeft.replaceChildren();
  hudRight.replaceChildren();
  if (scene !== "battle") {
    hudLeft.append(h("b", {}, scene === "setup" ? "Skirmish" : ""));
    return;
  }
  const sd = b.sides[0];
  hudLeft.append(
    h("b", {}, phase === "deploy" ? "Deploy" : `Round ${b.round + (phase === "over" ? 0 : 1)}`),
  );
  if (sd.hero) {
    const dots = h(
      "span",
      { class: "cl-valor", "aria-label": `Valor ${sd.valor} of ${sd.valorMax}` },
      h("span", { class: "dim" }, "Valor"),
    );
    for (let i = 0; i < sd.valorMax; i++) dots.append(h("i", { class: i < sd.valor ? "on" : "" }));
    hudLeft.append(dots);
  }
  const you = strength(b, 0).men;
  const them = strength(b, 1).men;
  hudRight.append(
    h(
      "span",
      {},
      h("i", { class: "cl-dot", style: { background: sideLook(b, 0).color } }),
      h("b", {}, you),
    ),
    h("span", { class: "dim" }, "v"),
    h(
      "span",
      {},
      h("i", { class: "cl-dot", style: { background: sideLook(b, 1).color } }),
      h("b", {}, them),
    ),
  );
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

createLoop((raw) => {
  // The first frame's timestamp can come before the loop's start.
  const dt = Math.max(0, raw);
  elapsed += dt;
  const { width: W, height: H } = stage;
  ctx.clearRect(0, 0, W, H);

  if (scene === "title" && demo) {
    // A battle between two plain AIs plays behind the title.
    if (!view.playing()) {
      if (demo.over) newDemo();
      else view.play(playRound(demo));
    }
    view.update(dt, 0.8);
  } else if (scene === "battle" && b) {
    if (view.update(dt)) roundShown();
    if (phase === "play") {
      const go = ui.querySelector(".cl-ring");
      if (go) go.style.width = `${Math.round(view.progress() * 100)}%`;
    }
  }
  stepOdds();

  if (settings.camera === "follow" && scene === "battle") {
    const f = view.focus();
    const k = Math.min(1, dt * 2.5);
    cam = { x: cam.x + (f.x - cam.x) * k, y: cam.y + (f.y - cam.y) * k };
  }
  const L = currentLayout();
  view.draw(ctx, L, {
    selected: scene === "battle" ? sel : new Set(),
    deploy: scene === "battle" && phase === "deploy",
    targeting: scene === "battle" && mode === "target",
    tactics: scene === "battle" ? (b.sides[0].hero?.tactics ?? 0) : 0,
    now: elapsed,
  });
  if (scene === "title" || scene === "setup") {
    ctx.fillStyle = scene === "setup" ? "rgba(16,19,26,.35)" : "rgba(16,19,26,.15)";
    ctx.fillRect(0, 0, W, H);
  }

  if (toast) {
    toast.life -= dt;
    let el = ui.querySelector(".cl-toast");
    if (toast.life <= 0) {
      el?.remove();
      toast = null;
    } else {
      if (!el) {
        el = h("div", { class: "cl-toast" });
        ui.append(el);
      }
      el.textContent = toast.text;
      el.style.top = "10px";
      el.style.opacity = String(Math.min(1, toast.life / 0.4));
    }
  }
});

toTitle();
