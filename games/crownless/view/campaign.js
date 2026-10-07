/**
 * The campaign screen (ui.md §2–4): the world map, the context bar, the tab
 * bar and the sheets over them, and New campaign before it all.
 *
 * game.js owns the shell, the loop and the title; while the campaign is on
 * screen it hands this module the frame and the DOM. Rules decide (world.js),
 * this draws and turns taps into orders, and the save is written after every
 * order, every 6 in-game hours on the road, when travel stops and on pagehide
 * (tech.md §4).
 */
import { createInput, vibrate } from "../../../shared/engine.js";
import {
  newCampaign,
  realmOf,
  route,
  travelTo,
  stop,
  rest,
  busy,
  advance,
  hoursInto,
  inSight,
  explored,
  pace,
  menOf,
  dayOf,
  clock,
  isNight,
  attack,
  partiesInSight,
  yourWorth,
  spares,
  MORNING,
} from "../rules/world.js";
import { partyMen, partyWorth, hexOf } from "../rules/parties.js";
import {
  foeOf,
  troopName,
  encounterBattle,
  choices,
  leave as walkAway,
  payOff,
  sacrifice,
  rearguardOf,
  autoResolve,
  dismiss,
  oddsRun,
  summarizeOdds,
  strength,
} from "../rules/encounter.js";
import {
  placeHere,
  offersAt,
  recruit,
  marketAt,
  buy,
  upgradesOf,
  upgradeRoom,
  upgrade,
  xpNext,
  xpTo,
  wagesOf,
  moraleOf,
  limitOf,
  ransomOf,
  sellPrisoners,
  releasePrisoners,
  prisonerRoom,
  recruitPrisoners,
} from "../rules/warband.js";
import { readCampaign, makeCampaign } from "../rules/campaign-save.js";
import { BRIGAND_NAMES } from "../rules/data/parties.js";
import { TERRAIN, PLACES, LAIRS, PICKUPS, GREAT_LAIRS, CULTURE_IDS } from "../rules/data/world.js";
import { BACKGROUNDS } from "../rules/data/hero.js";
import { CULTURES, troop } from "../rules/data/troops.js";
import {
  mapLayout,
  clampCamera,
  hexUnder,
  hexUnderOverview,
  cameraOn,
  toScreen,
  TABS_H,
} from "./map-layout.js";
import { createMapView, partyAt } from "./map-view.js";
import { h, troopList, troopWord } from "./sheets.js";
import { dist } from "../rules/hex.js";

/** An hour of travel on screen, in seconds (world.md §2); ⏩ runs at 3×. */
export const HOUR_S = 0.12;
/** Save this often while time runs, in in-game hours (tech.md §4). */
const SAVE_EVERY = 6;
/** Auto-resolves behind the odds on the encounter sheet, one a frame (battle.md §12). */
const ODDS_RUNS = 8;
/** A party's shield answers taps this far from its centre, in CSS pixels. */
const PARTY_HIT = 26;

const ICONS = {
  gold: '<svg viewBox="-7 -7 14 14" width="14" height="14" aria-hidden="true"><circle r="6" fill="#fbbf24" stroke="#a36d05" stroke-width="1.2"/><circle r="3.3" fill="none" stroke="#a36d05" stroke-width="1.2"/></svg>',
  iron: '<svg viewBox="-7 -7 14 14" width="14" height="14" aria-hidden="true"><path d="M-6 3.5L-3.6-3H3.6L6 3.5Z" fill="#9fb0c4" stroke="#4b5868"/></svg>',
  horses:
    '<svg viewBox="-7 -7 14 14" width="14" height="14" aria-hidden="true"><path d="M-4.2 3.2A5 5 0 1 1 4.2 3.2" fill="none" stroke="#d9b38c" stroke-width="2.6" stroke-linecap="round"/></svg>',
  map: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  army: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 4h14v7c0 5-4 8-7 9-3-1-7-4-7-9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  log: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h16 M4 12h16 M4 17h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  centre:
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v5 M12 17v5 M2 12h5 M17 12h5" stroke="currentColor" stroke-width="1.8"/></svg>',
};
const icon = (name) => h("span", { class: "cl-icon", html: ICONS[name] });

const btn = (label, onClick, { cls = "", disabled = false, aria, tip } = {}) =>
  h(
    "button",
    {
      type: "button",
      class: `cl-btn ${cls}`,
      "aria-disabled": disabled ? "true" : null,
      "aria-label": aria,
      "data-tip": tip,
      onClick: (e) => {
        e.stopPropagation();
        if (!disabled) onClick?.();
      },
    },
    label,
  );

/** "Day 3 · 07:00", or "07:00" on the same day as `now`. */
const when = (t, now) => (dayOf(t) === dayOf(now) ? clock(t) : `day ${dayOf(t)} · ${clock(t)}`);

/** What a place is called on its own line, and what it is on the next. */
export function describePlace(p) {
  if (p.kind === "crownhold") return { title: "Crownhold", sub: "The ruined capital" };
  if (p.kind === "town" || p.kind === "castle")
    return {
      title: p.name,
      sub: `${CULTURES[p.culture].name} ${p.kind}${p.capital ? " · the claimant's seat" : ""}`,
    };
  if (p.kind === "village")
    return { title: p.name, sub: `${CULTURES[p.culture].name} village · ${p.specialty}` };
  if (p.kind === "lair") return { title: LAIRS[p.lair].name, sub: "A lair" };
  if (p.kind === "great")
    return { title: GREAT_LAIRS.find((g) => g.id === p.great).name, sub: "A great lair" };
  if (p.kind === "pickup") return { title: PICKUPS[p.pickup].name, sub: "Lying out in the open" };
  if (p.kind === "tower") return { title: "Watchtower", sub: "Climb it to see far around" };
  return {
    title: PLACES[p.kind].name,
    sub: p.kind === "iron" || p.kind === "ranch" || p.kind === "gold" ? "Unclaimed" : "",
  };
}

/** "60 gold", "3 iron", "2 horses": what a pickup held. */
const pickupWords = (p) =>
  p.pickup === "gold"
    ? `${p.amount} gold`
    : p.pickup === "iron"
      ? `${p.amount} iron`
      : `${p.amount} horses`;

/** Why a button can't do more, in words (warband.js's reasons). */
const WHY = {
  gold: "not enough gold",
  iron: "not enough iron",
  horses: "not enough horses",
  room: "your party is full",
  limit: "your party is over its limit",
  left: "none left this week",
  xp: "not enough XP yet",
  wounded: "no fit men to train",
  days: "they haven't been held long enough",
};

/** The same, in a word or two under a greyed upgrade. */
const NEEDS = {
  gold: "needs gold",
  iron: "needs iron",
  horses: "needs horses",
  limit: "over the limit",
  xp: "needs XP",
  wounded: "no fit men",
};

/** "40 gold, 1 iron", "55 gold, 1 horse": what one of something costs. */
function costText(c) {
  const parts = [`${c.gold} gold`];
  if (c.iron) parts.push(`${c.iron} iron`);
  if (c.horses) parts.push(`${c.horses} ${c.horses === 1 ? "horse" : "horses"}`);
  return parts.join(", ");
}

/** "Footman", "Lancer": a troop's own name, without its culture. */
const shortName = (id) => {
  const w = troopWord(id, 1);
  return w[0].toUpperCase() + w.slice(1);
};

/** "6 brigands", "2 raiders": prisoners in their band's words, or a troop's. */
function prisonerWords(type, n) {
  const name = BRIGAND_NAMES[type]?.toLowerCase();
  if (!name) return `${n} ${troopWord(type, n)}`;
  return `${n} ${n === 1 ? name : `${name}s`}`;
}

/** "5 levies are militia now": what abandoned arms did. */
const armsWords = (up) =>
  up
    .map(
      ([from, to, k]) =>
        `${k} ${troopWord(from, k)} ${k === 1 ? "is" : "are"} ${troopWord(to, k)} now`,
    )
    .join(", ");

/** "9 looters, 6 brigands", "14 wolves": a party's men in its own words. */
function partyList(party) {
  return party.troops
    .map((t) => {
      if (t.type === "wolf") return `${t.n} ${t.n === 1 ? "wolf" : "wolves"}`;
      const name = troopName(party, t.type).toLowerCase();
      return `${t.n} ${t.n === 1 || name === "militia" ? name : `${name}s`}`;
    })
    .join(", ");
}

export function createCampaign({ stage, ui, hudLeft, hudRight, store, onEnter, onExit }) {
  const view = createMapView();
  let active = false;
  let mode = "map"; // new | map | overview
  let sheet = null; // null | army | log | menu
  let state = null;
  let realm = null;
  let draft = null; // New campaign: {seed, culture, background}
  let cam = { x: 0, y: 0 };
  let follow = true;
  let sel = -1;
  let speed = 1;
  let acc = 0;
  let sinceSave = 0;
  let prev = null; // where the party was before the last hour, for drawing between
  let prevParties = null; // the same for everyone else on the map, by id
  let drawn = []; // parties as last drawn, in screen pixels, for taps
  let selParty = null; // the party whose card is on the context bar
  let odds = null; // the encounter sheet's odds: {seed, b, base, runs, done}
  let toast = null;
  let els = {}; // what the hourly refresh rewrites in place

  const layoutNow = () => mapLayout(stage.width, stage.height);
  const save = () => {
    if (state && mode !== "new") {
      store.set("campaign", makeCampaign(state));
      sinceSave = 0;
    }
  };
  addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => document.hidden && active && save());

  function say(text) {
    toast = { text, life: Math.max(2.2, text.length / 18) };
  }

  // -------------------------------------------------------------------------
  // Entering and leaving
  // -------------------------------------------------------------------------

  function openNew() {
    active = true;
    mode = "new";
    sheet = null;
    const prevDraft = draft;
    draft = {
      seed: (Math.random() * 2 ** 32) >>> 0,
      culture: prevDraft?.culture ?? "vale",
      background: prevDraft?.background ?? "sellsword",
    };
    rebuildDraft();
    onEnter();
    render();
  }

  function rebuildDraft() {
    state = newCampaign(draft);
    realm = realmOf(state);
    cam = cameraOn(layoutNow(), realm.grid, state.player.at.i);
  }

  function begin() {
    mode = "map";
    sel = -1;
    follow = true;
    prev = null;
    save();
    say(`You set out from ${realm.places[realm.placeAt[state.player.at.i]].name}`);
    render();
  }

  function resume(s) {
    active = true;
    state = s;
    realm = realmOf(state);
    mode = "map";
    sheet = null;
    sel = -1;
    selParty = null;
    follow = true;
    prev = null;
    prevParties = null;
    odds = null;
    acc = 0;
    cam = cameraOn(layoutNow(), realm.grid, state.player.at.i);
    onEnter();
    render();
  }

  function leave() {
    save();
    active = false;
    state = null;
    onExit();
  }

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  function go(dest = sel) {
    if (!travelTo(state, dest)) return;
    sel = -1;
    follow = true;
    acc = 0;
    save();
    render();
  }

  function onStop() {
    stop(state);
    save();
    render();
  }

  function onRest() {
    sel = -1;
    if (rest(state)) {
      acc = 0;
      save();
    }
    render();
  }

  /** Go after the party on the card (ui.md §3: Attack). */
  function onAttack() {
    if (selParty == null || !attack(state, selParty, realm)) return;
    selParty = null;
    sel = -1;
    follow = true;
    acc = 0;
    save();
    render();
  }

  /** An answer to the encounter sheet; the map goes on from where it stood. */
  function answer(fn, message) {
    const foe = foeOf(state);
    if (!foe || !fn(state, realm)) return;
    odds = null;
    selParty = null;
    save();
    if (message) say(message(foe));
    vibrate(10);
    render();
  }

  const onPay = () => {
    const cost = choices(state).pay;
    answer(payOff, () => `Paid ${cost} gold. They'll let you be for three days`);
  };
  const onLeave = () => answer(walkAway, () => "You slip away");
  const onRearguard = () => {
    const lost = troopList(rearguardOf(state.player.party.troops));
    answer(sacrifice, () => `Your rearguard of ${lost} holds them off`);
  };
  const onAuto = () => answer(autoResolve, null);

  /** A deal in a settlement or on the Army sheet: done, saved, said. */
  function deal(fn, message) {
    const r = fn();
    if (!r) return;
    save();
    if (message) say(message(r));
    vibrate(8);
    render();
  }
  const onRecruit = (type, n) =>
    deal(
      () => recruit(state, realm, type, n),
      (k) => `${k} ${troopWord(type, k)} join you`,
    );
  const onBuy = (what, n) =>
    deal(
      () => buy(state, realm, what, n),
      (k) => `Bought ${k} ${what === "iron" ? "iron" : k === 1 ? "horse" : "horses"}`,
    );
  const onSell = (k) => {
    const s = state.player.party.prisoners[k];
    const words = prisonerWords(s.type, s.n);
    deal(
      () => sellPrisoners(state, realm, k),
      (gold) => `Sold ${words} for ${gold} gold`,
    );
  };
  const onRelease = (k) => {
    const s = state.player.party.prisoners[k];
    const words = prisonerWords(s.type, s.n);
    deal(
      () => releasePrisoners(state, k),
      () => `You let ${words} go`,
    );
  };
  const onTakeOn = (k) => {
    const as = prisonerRoom(state, k).as;
    deal(
      () => recruitPrisoners(state, k),
      (n) => `${n} ${troopWord(as, n)} join you`,
    );
  };
  const onUpgrade = (type, to) =>
    deal(
      () => upgrade(state, type, to),
      (n) => `${n} ${troopWord(type, n)} ${n === 1 ? "is" : "are"} ${troopWord(to, n)} now`,
    );

  /** The settlement you stand in, opened (ui.md §4: Place). */
  function openPlace() {
    if (!placeHere(state, realm)) return;
    sel = -1;
    selParty = null;
    sheet = "place";
    vibrate(6);
    render();
  }

  function onContinue() {
    dismiss(state);
    follow = true;
    save();
    render();
  }

  function centreOnYou() {
    follow = true;
    if (mode === "overview") mode = "map";
    render();
  }

  // -------------------------------------------------------------------------
  // Taps and drags on the map
  // -------------------------------------------------------------------------

  let press = null;
  createInput(stage, {
    onDown(p) {
      if (!active || mode === "new") return;
      press = { x: p.x, y: p.y, cam: { ...cam }, drag: false };
    },
    onMove(p) {
      if (!press || mode !== "map") return;
      if (!press.drag && Math.hypot(p.x - press.x, p.y - press.y) > 10) press.drag = true;
      if (press.drag) {
        follow = false;
        cam = clampCamera(layoutNow(), realm.grid, {
          x: press.cam.x - (p.x - press.x),
          y: press.cam.y - (p.y - press.y),
        });
      }
    },
    onUp() {
      press = null;
    },
    onTap({ x, y }) {
      if (!active || mode === "new") return;
      tap(x, y);
    },
  });

  function tap(x, y) {
    const L = layoutNow();
    if (y >= L.viewH) return;
    if (sheet) {
      // Tapping the map above a sheet closes it (ui.md §1, rule 5).
      sheet = null;
      render();
      return;
    }
    if (mode === "overview") {
      const i = hexUnderOverview(L, realm.grid, x, y);
      if (i >= 0) cam = cameraOn(L, realm.grid, i);
      follow = false;
      mode = "map";
      render();
      return;
    }
    if (state.encounter || state.result) return;
    const hit = partyUnder(x, y);
    if (hit != null) {
      if (busy(state)) stop(state);
      if (hit === selParty && !busy(state)) {
        onAttack();
        return;
      }
      selParty = hit;
      sel = -1;
      vibrate(6);
      render();
      return;
    }
    selParty = null;
    const i = hexUnder(L, cam, realm.grid, x, y);
    if (i < 0) return;
    if (busy(state)) {
      // A tap on the road stops you and shows where it would take you.
      stop(state);
      sel = i;
      render();
      return;
    }
    if (i === sel && i !== state.player.at.i && route(state, i)) {
      go(i);
      return;
    }
    if (i === state.player.at.i && placeHere(state, realm)) {
      openPlace();
      return;
    }
    sel = i;
    vibrate(6);
    render();
  }

  /** The party drawn nearest a tap, if one is near enough. */
  function partyUnder(x, y) {
    let best = null;
    let bd = PARTY_HIT;
    for (const d of drawn) {
      const k = Math.hypot(d.x - x, d.y - y);
      if (k < bd) [bd, best] = [k, d.id];
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // The frame
  // -------------------------------------------------------------------------

  function frame(ctx, dt) {
    if (!active || !state) return;
    const L = layoutNow();
    if (mode !== "new" && busy(state)) {
      acc += dt * speed;
      let n = 0;
      while (acc >= HOUR_S && busy(state) && n++ < 10) {
        acc -= HOUR_S;
        prev = partyAt(realm, state.player.at, L.R);
        prevParties = new Map(state.parties.map((pt) => [pt.id, partyAt(realm, pt.at, L.R)]));
        const events = advance(state, realm);
        sinceSave++;
        shown(events);
        if (sinceSave >= SAVE_EVERY) save();
      }
      if (!busy(state)) {
        acc = 0;
        prev = null;
        prevParties = null;
        save();
        render();
      } else refresh();
    } else {
      prev = null;
      prevParties = null;
    }
    if (mode !== "new" && state.encounter) workOdds();

    const f = Math.min(1, acc / HOUR_S);
    const between = (a, b) => (a ? { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f } : b);
    let party = partyAt(realm, state.player.at, L.R);
    if (prev) party = between(prev, party);
    const parties = mode === "map" ? partiesInSight(state, realm) : [];
    const onMap = parties.map((pt) => ({
      id: pt.id,
      kind: pt.kind,
      hex: hexOf(pt.at),
      label: String(partyMen(pt)),
      hunting: pt.goal === "hunt" && !spares(state, pt),
      sel: pt.id === selParty,
      ...between(prevParties?.get(pt.id), partyAt(realm, pt.at, L.R)),
    }));
    if (follow) {
      const k = Math.min(1, dt * 4);
      // A sheet over the map's lower half: keep the meeting above it.
      const held = state.encounter || state.result;
      const want = clampCamera(
        L,
        realm.grid,
        held ? { x: party.x, y: party.y + L.viewH * 0.28 } : party,
      );
      cam = { x: cam.x + (want.x - cam.x) * k, y: cam.y + (want.y - cam.y) * k };
    }
    cam = clampCamera(L, realm.grid, cam);
    drawn = onMap.map((pt) => ({ id: pt.id, ...toScreen(L, cam, pt.x, pt.y - 3) }));

    const seen = explored(state, realm);
    if (mode === "overview")
      view.drawOverview(ctx, L, { realm, seen, party, exploredKey: state.explored });
    else
      view.draw(ctx, L, cam, {
        state,
        realm,
        seen,
        sight: new Set(inSight(state, realm)),
        party,
        here: state.player.at.to < 0 ? state.player.at.i : -1,
        sel,
        selOk: sel >= 0 && !!route(state, sel),
        plan: planToDraw(),
        night: isNight(state.t),
        men: String(menOf(state.player.party)),
        parties: onMap,
        gone: (id) => state.gone.includes(id),
      });
    if (mode === "new") {
      ctx.fillStyle = "rgba(16,19,26,.35)";
      ctx.fillRect(0, 0, L.W, L.H);
    }
    drawToast(dt);
  }

  /** The path drawn on the map: where you're going, or where you'd go. */
  function planToDraw() {
    const p = state.player;
    if (state.encounter || state.result) return null;
    const dest = p.dest >= 0 ? p.dest : sel;
    if (dest < 0 || (dest === p.at.i && p.at.to < 0)) return null;
    const r = route(state, dest, realm);
    if (!r) return null;
    const hours = [0];
    for (let k = 1; k < r.path.length; k++)
      hours.push(
        k === 1 && p.at.to >= 0
          ? (1 - p.at.progress) * hoursInto(realm, p, p.at.to)
          : hoursInto(realm, p, r.path[k]),
      );
    return { path: r.path, hours, eta: `arrive ${when(Math.ceil(r.arrive), state.t)}` };
  }

  function shown(events) {
    for (const e of events) {
      const p = e.id != null ? realm.places[e.id] : null;
      if (e.k === "discover" && ["town", "castle", "crownhold", "lair"].includes(p.kind))
        say(`Found ${describePlace(p).title}`);
      else if (e.k === "tower") say("From the watchtower you see the land for miles around");
      else if (e.k === "arrive") {
        say(p ? `Reached ${describePlace(p).title}` : "Arrived");
        // Arriving at a settlement opens it: what you came for is in there.
        if (placeHere(state, realm)) sheet = "place";
        vibrate(10);
      } else if (e.k === "rested") say("Morning");
      else if (e.k === "pickup") {
        say(
          e.up
            ? `Abandoned arms: ${armsWords(e.up)}`
            : !e.none
              ? `Picked up ${pickupWords(p)}`
              : p.pickup === "chest"
                ? "A chest, locked fast. It will keep"
                : "Abandoned arms, and nobody to give them to",
        );
        vibrate(10);
      } else if (e.k === "week") {
        if (e.paid < e.due)
          say(
            `Short of wages: paid ${e.paid} of ${e.due}${e.deserted ? `. ${e.deserted} deserted` : ""}`,
          );
        else if (e.due || e.deserted)
          say(`Paid ${e.due} gold in wages${e.deserted ? `. ${e.deserted} deserted` : ""}`);
      } else if (e.k === "freed") {
        say(e.gold ? `Ransomed for ${e.gold} gold. You're free` : "You slip away. You're free");
        vibrate([20, 40, 20]);
      } else if (e.k === "spotted") {
        const pt = state.parties.find((x) => x.id === e.id);
        if (pt) say(pt.goal === "hunt" ? `${pt.name}, coming for you` : `${pt.name} sighted`);
        vibrate(15);
      } else if (e.k === "lost-track") say("You've lost track of them");
      else if (e.k === "encounter") {
        follow = true;
        sel = -1;
        selParty = null;
        vibrate([20, 40, 20]);
      }
    }
  }

  /** The encounter sheet's odds: one auto-resolve a frame, summarized at the end. */
  function workOdds() {
    const seed = state.encounter.seed;
    if (!odds || odds.seed !== seed) {
      const b = encounterBattle(state, realm);
      odds = { seed, b, base: JSON.stringify(b), runs: [], done: null };
      return;
    }
    if (odds.done) return;
    odds.runs.push(oddsRun(odds.b, odds.runs.length, odds.base));
    if (odds.runs.length < ODDS_RUNS) return;
    odds.done = summarizeOdds(odds.runs);
    render();
  }

  function drawToast(dt) {
    let el = ui.querySelector(".cl-toast");
    if (!toast) {
      el?.remove();
      return;
    }
    toast.life -= dt;
    if (toast.life <= 0) {
      el?.remove();
      toast = null;
      return;
    }
    if (!el) {
      el = h("div", { class: "cl-toast", role: "status" });
      ui.append(el);
    }
    el.textContent = toast.text;
    el.style.top = "10px";
    el.style.opacity = String(Math.min(1, toast.life / 0.4));
  }

  // -------------------------------------------------------------------------
  // The DOM
  // -------------------------------------------------------------------------

  function renderHud() {
    hudLeft.replaceChildren();
    hudRight.replaceChildren();
    if (mode === "new") {
      hudLeft.append(h("b", {}, "New campaign"));
      return;
    }
    const p = state.player;
    els.clock = h("b", {}, `Day ${dayOf(state.t)} · ${clock(state.t)}`);
    hudLeft.append(els.clock);
    for (const [k, v] of [
      ["gold", p.gold],
      ["iron", p.iron],
      ["horses", p.horses],
    ])
      hudRight.append(
        h("span", { class: "cl-res", "aria-label": `${k} ${v}` }, icon(k), h("b", {}, v)),
      );
  }

  /** The hourly refresh: the clock and the context bar's line, in place. */
  function refresh() {
    if (els.clock) els.clock.textContent = `Day ${dayOf(state.t)} · ${clock(state.t)}`;
    const c = context();
    if (els.title && els.title.textContent !== c.title) els.title.textContent = c.title;
    if (els.sub && els.sub.textContent !== c.sub) els.sub.textContent = c.sub;
  }

  /** What the context bar says and offers (ui.md §3). */
  function context() {
    const p = state.player;
    const placeAt = (i) => (realm.placeAt[i] >= 0 ? realm.places[realm.placeAt[i]] : null);
    if (p.captive)
      return {
        title: `Held by ${p.captive.by}`,
        sub: `free ${when(p.captive.until, state.t)}`,
        kind: "captive",
      };
    if (p.resting)
      return {
        title: "Resting",
        sub: `until ${clock(MORNING)} · tap Stop to break camp`,
        kind: "rest",
      };
    if (p.chase != null) {
      const pt = state.parties.find((x) => x.id === p.chase);
      const d = pt ? dist(realm.grid, p.at.i, pt.at.i) : 0;
      return {
        title: `After ${pt?.name ?? "them"}`,
        sub: d > 0 ? `${d} ${d === 1 ? "hex" : "hexes"} ahead · Stop to give up` : "Closing in",
        kind: "travel",
      };
    }
    if (selParty != null) {
      const pt = state.parties.find((x) => x.id === selParty);
      if (pt && partiesInSight(state, realm).includes(pt)) {
        const theirs = partyWorth(pt);
        const mine = yourWorth(state);
        return {
          title: pt.name,
          sub: doing(pt)
            ? `${partyMen(pt)} men · ${doing(pt)}`
            : `${partyMen(pt)} men · strength ${Math.round(theirs)} · you ${Math.round(mine)}`,
          kind: "party",
          vs: mine / (mine + theirs),
        };
      }
      selParty = null;
    }
    if (p.dest >= 0) {
      const r = route(state, p.dest, realm);
      const place = placeAt(p.dest);
      const name =
        place && !place.hidden ? describePlace(place).title : TERRAIN[realm.terrain[p.dest]].name;
      const left = r ? Math.max(1, Math.ceil(r.hours)) : 0;
      return {
        title: `To ${name}`,
        sub: r ? `${left} h left · arrive ${when(Math.ceil(r.arrive), state.t)}` : "",
        kind: "travel",
      };
    }
    const seen = explored(state, realm);
    const here = (i) => {
      if (!seen(i)) return { title: "Unexplored", sub: "" };
      const place = placeAt(i);
      if (place && !place.hidden) return describePlace(place);
      return { title: TERRAIN[realm.terrain[i]].name, sub: "" };
    };
    if (sel >= 0 && sel !== p.at.i) {
      const d = here(sel);
      const r = route(state, sel, realm);
      const way = r ? `${Math.max(1, Math.ceil(r.hours))} h away` : "No way there";
      return { title: d.title, sub: d.sub ? `${d.sub} · ${way}` : way, kind: "pick", ok: !!r };
    }
    const d = here(p.at.i);
    if (placeHere(state, realm)) return { title: d.title, sub: d.sub, kind: "place" };
    return {
      title: d.title,
      sub:
        sel === p.at.i
          ? `You are here · rest until ${clock(MORNING)}?`
          : "Tap the map to choose where to go",
      kind: "idle",
    };
  }

  /** What a party seems to be about: you see a hunt; the rest takes Scouting (ui.md §3). */
  function doing(pt) {
    if (pt.goal === "hunt" && !spares(state, pt)) return "coming for you";
    if (spares(state, pt)) return "letting you be";
    if (!state.player.hero.scouting) return "";
    if (pt.goal === "flee") return "running from you";
    return pt.goal === "roam" ? "on the move" : "waiting";
  }

  function render() {
    if (!active) return;
    ui.replaceChildren();
    els = {};
    renderHud();
    if (mode === "new") {
      ui.append(newSheet());
      return;
    }
    if (state.result) {
      ui.append(resultSheet());
      return;
    }
    if (state.encounter) {
      ui.append(encounterSheet());
      return;
    }
    const c = context();
    els.title = h("div", { class: "cl-ctx-title" }, c.title);
    els.sub = h("div", { class: "cl-ctx-sub" }, c.sub);
    const centreBtn = btn(icon("centre"), centreOnYou, {
      cls: "square",
      aria: "Centre on you",
      tip: "Centre: back to your banner, and follow it.",
    });
    let actions;
    if (c.kind === "travel")
      actions = [
        btn(
          speed === 1 ? "⏩ 1×" : "⏩ 3×",
          () => {
            speed = speed === 1 ? 3 : 1;
            render();
          },
          { aria: "Speed", tip: "Speed: an hour of travel takes a moment; ⏩ makes it a third." },
        ),
        btn("Stop", onStop, { cls: "primary", tip: "Stop: halt at the next hex." }),
      ];
    else if (c.kind === "rest")
      actions = [btn("Stop", onStop, { cls: "primary", tip: "Stop: break camp now." })];
    else if (c.kind === "captive")
      actions = [
        btn(
          speed === 1 ? "⏩ 1×" : "⏩ 3×",
          () => {
            speed = speed === 1 ? 3 : 1;
            render();
          },
          { aria: "Speed", tip: "Speed: the days you're held pass; ⏩ makes them go faster." },
        ),
      ];
    else if (c.kind === "place")
      actions = [
        centreBtn,
        btn("Visit ▶", openPlace, {
          cls: "primary",
          tip: "Visit: recruit, trade and rest here.",
        }),
      ];
    else if (c.kind === "party")
      actions = [
        btn("Attack ▶", onAttack, {
          cls: "primary",
          tip: "Attack: go after them, wherever they run. Stop gives up.",
        }),
      ];
    else if (c.kind === "pick")
      actions = [
        centreBtn,
        btn("Go ▶", () => go(), {
          cls: "primary",
          disabled: !c.ok,
          tip: c.ok
            ? "Go: travel there. Time passes only while you travel."
            : "No road or ford leads there.",
        }),
      ];
    else
      actions = [
        centreBtn,
        btn("Rest", onRest, {
          cls: sel === state.player.at.i ? "primary" : "",
          tip: `Rest: let the hours pass here until ${clock(MORNING)}.`,
        }),
      ];
    ui.append(
      h(
        "div",
        { class: "cl-ctx", style: { bottom: `${TABS_H}px` } },
        h("div", { class: "cl-ctx-text" }, els.title, els.sub, c.vs != null ? vsBar(c.vs) : null),
        actions,
      ),
    );
    ui.append(tabBar());
    if (sheet === "place") {
      const el = placeSheet();
      if (el) ui.append(el);
      else sheet = null;
    }
    if (sheet === "army") ui.append(armySheet());
    if (sheet === "log") ui.append(logSheet());
    if (sheet === "menu") ui.append(menuSheet());
  }

  function tabBar() {
    const tab = (id, label) =>
      h(
        "button",
        {
          type: "button",
          class: `cl-tabbtn${(sheet ?? "map") === id ? " on" : ""}`,
          "aria-pressed": (sheet ?? "map") === id ? "true" : "false",
          onClick: (e) => {
            e.stopPropagation();
            if (id === "map") {
              // The Map tab on the map shows the whole realm (ui.md §3).
              if (!sheet) mode = mode === "overview" ? "map" : "overview";
              sheet = null;
            } else sheet = sheet === id ? null : id;
            render();
          },
        },
        icon(id),
        h("span", {}, label),
      );
    return h(
      "nav",
      { class: "cl-tabbar", "aria-label": "Tabs" },
      tab("map", "Map"),
      tab("army", "Army"),
      tab("log", "Log"),
      tab("menu", "Menu"),
    );
  }

  const sheetBox = (label, body, actions) =>
    h(
      "div",
      { class: "cl-sheet", role: "dialog", "aria-label": label, style: { bottom: `${TABS_H}px` } },
      h("div", { class: "cl-body" }, body),
      h("div", { class: "cl-actions" }, actions),
    );
  const back = () =>
    btn("Back", () => {
      sheet = null;
      render();
    });

  /** You against them, as a two-coloured bar: your share of the strength on the left. */
  const vsBar = (share) =>
    h(
      "div",
      { class: "cl-vs", role: "img", "aria-label": `you ${Math.round(share * 100)}%` },
      h("i", { style: { width: `${Math.round(share * 100)}%` } }),
    );

  /** Meeting a party (ui.md §4): both sides, the odds, and what you may do. */
  function encounterSheet() {
    const p = state.player;
    const foe = foeOf(state);
    const c = choices(state);
    if (!odds || odds.seed !== state.encounter.seed) workOdds();
    const mine = strength(odds.b, 0);
    const theirs = strength(odds.b, 1);
    const fit = p.party.troops.reduce((m, t) => m + t.n - t.wounded, 0);
    const came = state.encounter.by === "you" ? "You caught them" : "They came for you";
    let oddsLine;
    if (!odds.done) oddsLine = h("p", { class: "cl-odds" }, "Odds: working them out…");
    else {
      // Only what you'd lose of your own: the banner's household are the hero's.
      const own = new Set(p.party.troops.map((t) => t.type));
      const lose = troopList(
        Object.fromEntries(Object.entries(odds.done.losses).filter(([t]) => own.has(t))),
      );
      oddsLine = h(
        "p",
        { class: "cl-odds" },
        "Odds: ",
        h("b", {}, odds.done.word),
        ` (${odds.done.wins} of ${odds.done.runs})`,
        lose ? ` · you'd lose about ${lose}` : " · you'd lose almost no one",
      );
    }
    const away = c.leave
      ? c.faster
        ? "You're faster: you can leave."
        : "You came for them: you can leave."
      : `You can't outrun them. A rearguard of ${troopList(rearguardOf(p.party.troops))} would hold them.`;
    const actions = [];
    if (c.pay)
      actions.push(
        btn(`Pay ${c.pay}`, onPay, {
          tip: `Pay: ${c.pay} gold, a fifth of yours, and they leave you alone for three days.`,
        }),
      );
    if (c.leave)
      actions.push(
        btn("Leave", onLeave, { tip: "Leave: walk away. They can't catch you for 6 hours." }),
      );
    else if (c.rearguard)
      actions.push(
        btn("Rearguard", onRearguard, {
          tip: "Rearguard: leave your slowest men behind to hold them; they are lost, the rest get away.",
        }),
      );
    actions.push(
      btn("Auto ▶", onAuto, {
        cls: "primary",
        tip: "Auto-resolve: the battle, fought out at once by both sides' plain AI.",
      }),
    );
    return h(
      "div",
      { class: "cl-sheet cl-meet", role: "dialog", "aria-label": "Encounter" },
      h(
        "div",
        { class: "cl-body" },
        h("h2", {}, foe.name),
        h(
          "div",
          { class: "cl-army" },
          h("b", {}, "Them"),
          ` · ${came.toLowerCase()}`,
          foe.kind === "wolves" ? "" : ` · ${partyMen(foe)} men`,
          ` · strength ${Math.round(theirs.worth)}`,
          foe.chief ? " · a chief leads them" : "",
          h("div", { class: "cl-dim" }, partyList(foe)),
        ),
        h(
          "div",
          { class: "cl-army" },
          h("b", {}, "You"),
          ` · ${fit} men · strength ${Math.round(mine.worth)}`,
          h(
            "div",
            { class: "cl-dim" },
            troopList(Object.fromEntries(p.party.troops.map((t) => [t.type, t.n - t.wounded]))),
          ),
        ),
        vsBar(mine.worth / (mine.worth + theirs.worth || 1)),
        oddsLine,
        h("p", { class: "cl-dim cl-away" }, away),
      ),
      h("div", { class: "cl-actions" }, actions),
    );
  }

  /** What came of it, read before the map goes on. */
  function resultSheet() {
    const r = state.result;
    const heading = r.kind === "won" ? "Victory" : r.kind === "lost" ? "Defeat" : "A draw";
    const them = r.foe === "wolves" ? "the pack" : "the band";
    const lines = [];
    if (r.kind === "won") lines.push(`You broke ${them}; it is gone from the map.`);
    else if (r.kind === "draw") lines.push(`Neither side gave way, and ${them} draws off for now.`);
    else if (r.held)
      lines.push(
        `You are taken. Your warband is scattered and your prisoners go free. They'll hold you ${r.held} days near ${r.at}.`,
      );
    else lines.push(`Your warband is scattered. You make it to ${r.at} alone, gold in hand.`);
    lines.push(
      r.killed || r.wounded
        ? `Of yours, ${r.killed} killed${r.wounded ? ` and ${r.wounded} wounded` : ""}.`
        : "You lost no one.",
    );
    lines.push(`They lost ${r.theirDead}.`);
    if (r.taken) lines.push(`You took ${r.taken} prisoners.`);
    if (r.loot) lines.push(`Loot: ${r.loot} gold.`);
    if (r.xp) lines.push(`Each of your men who fought and lived gained ${r.xp} XP.`);
    return h(
      "div",
      { class: "cl-sheet", role: "dialog", "aria-label": heading },
      h(
        "div",
        { class: "cl-body" },
        h("h2", {}, `${heading} · ${r.name}`),
        lines.map((t) => h("p", { class: "cl-army" }, t)),
      ),
      h("div", { class: "cl-actions" }, btn("Continue", onContinue, { cls: "primary" })),
    );
  }

  /** A row on the place and Army sheets: what it is, a line under it, its buttons. */
  const row = (title, sub, buttons) =>
    h(
      "div",
      { class: "cl-trade" },
      h("div", { class: "cl-trade-text" }, h("b", {}, title), sub ? h("small", {}, sub) : null),
      h("div", { class: "cl-trade-btns" }, buttons.filter(Boolean)),
    );
  /** A troop on the Army sheet: name and count, a line, its XP, and its upgrades under it. */
  const unit = (title, count, sub, bar, buttons) =>
    h(
      "div",
      { class: "cl-unit" },
      h("div", { class: "cl-unit-head" }, h("b", {}, title), h("b", {}, count)),
      h("small", {}, sub),
      bar,
      buttons.length ? h("div", { class: "cl-unit-btns" }, buttons) : null,
    );
  const label = (text) => h("div", { class: "cl-label cl-section" }, text);

  /** The settlement you stand in (ui.md §4): recruits, the market, the broker. */
  function placeSheet() {
    const place = placeHere(state, realm);
    if (!place) return null;
    const p = state.player;
    const d = describePlace(place);
    const body = [
      h("h2", {}, d.title),
      h(
        "p",
        { class: "cl-dim cl-note" },
        `${d.sub || "Sellswords for hire"} · your party ${menOf(p.party)} / ${limitOf(p)}`,
      ),
      label(place.kind === "camp" ? "Hire" : "Recruit"),
    ];
    for (const o of offersAt(state, realm, place)) {
      const name = troop(o.type).name;
      const each = costText(o.cost);
      body.push(
        row(
          name,
          `${o.left} here · ${each} each${o.n > 0 ? "" : ` · ${WHY[o.why]}`}`,
          o.n > 0
            ? [
                btn("+1", () => onRecruit(o.type, 1), { tip: `Hire one ${name} for ${each}.` }),
                o.n > 1
                  ? btn(`+${o.n}`, () => onRecruit(o.type, o.n), {
                      cls: "on",
                      tip: `Hire ${o.n}, all you can now, for ${o.n * o.cost.gold} gold.`,
                    })
                  : null,
              ]
            : [btn("Hire", null, { disabled: true, tip: `Hire: ${WHY[o.why]}.` })],
        ),
      );
    }
    const market = marketAt(state, realm, place);
    if (market.length) {
      body.push(label("Market"));
      for (const m of market) {
        const name = m.what === "iron" ? "Iron" : "Horses";
        body.push(
          row(
            name,
            `${m.left} for sale · ${m.price} gold each${m.n > 0 ? "" : ` · ${WHY[m.why]}`}`,
            m.n > 0
              ? [
                  btn("+1", () => onBuy(m.what, 1), { tip: `Buy one for ${m.price} gold.` }),
                  m.n > 1
                    ? btn(`+${m.n}`, () => onBuy(m.what, m.n), {
                        cls: "on",
                        tip: `Buy ${m.n}, all you can now, for ${m.n * m.price} gold.`,
                      })
                    : null,
                ]
              : [btn("Buy", null, { disabled: true, tip: `Buy: ${WHY[m.why]}.` })],
          ),
        );
      }
    }
    if (place.kind === "town" && p.party.prisoners.length) {
      body.push(label("Ransom broker"));
      p.party.prisoners.forEach((pr, k) => {
        const each = ransomOf(p, pr.type);
        body.push(
          row(prisonerWords(pr.type, pr.n), `${each} gold each`, [
            btn(`Sell · ${each * pr.n}`, () => onSell(k), {
              tip: `Sell: the broker pays ${each * pr.n} gold for all ${pr.n}.`,
            }),
          ]),
        );
      });
    }
    return sheetBox("Place", body, [
      back(),
      btn(
        "Rest here",
        () => {
          sheet = null;
          onRest();
        },
        { tip: `Rest here until ${clock(MORNING)}. The wounded heal faster in a settlement.` },
      ),
    ]);
  }

  /** Your warband (ui.md §4): men, wounded, XP toward the next tier, upgrades, prisoners. */
  function armySheet() {
    const p = state.player;
    const men = menOf(p.party);
    const wounded = p.party.troops.reduce((m, t) => m + t.wounded, 0);
    const body = [
      h("h2", {}, `Army · ${men} / ${limitOf(p)}`),
      h(
        "p",
        { class: "cl-dim cl-note" },
        `${BACKGROUNDS[p.background].name} of ${CULTURES[p.culture].name}, level ${p.hero.level}` +
          ` · morale ${moraleOf(p)} · wages ${wagesOf(p)} a week` +
          `${wounded ? ` · ${wounded} wounded` : ""} · ${Math.round(pace(p) * 10) / 10} hexes a day`,
      ),
    ];
    if (!men)
      body.push(h("p", { class: "cl-army" }, "No men. Recruit at a village, a town or a castle."));
    else if (men > limitOf(p))
      body.push(
        h("p", { class: "cl-warn-line" }, "Over the party limit: no recruiting or training."),
      );
    const troops = [...p.party.troops].sort(
      (a, b) => troop(b.type).tier - troop(a.type).tier || b.n - a.n,
    );
    for (const t of troops) {
      const need = xpNext(t.type);
      const ready = need ? Math.min(t.n, Math.floor(t.xp / need)) : 0;
      const sub = [
        t.wounded ? `${t.wounded} wounded` : "",
        need ? `${ready} of ${t.n} ready to train` : "the top of the line",
      ]
        .filter(Boolean)
        .join(" · ");
      const ups = upgradesOf(t.type).map((to) => {
        const r = upgradeRoom(state, t.type, to);
        const name = shortName(to);
        const tip = `${name}: ${xpTo(to)} XP a man and ${costText(r.cost)} each.`;
        return r.n > 0
          ? btn(`▲ ${name} ×${r.n}`, () => onUpgrade(t.type, to), { cls: "on", tip })
          : btn(h("span", {}, `▲ ${name}`, h("small", {}, NEEDS[r.why])), null, {
              disabled: true,
              tip: `${tip} Not now: ${WHY[r.why]}.`,
            });
      });
      const bar = need
        ? h(
            "div",
            { class: "cl-xp", role: "img", "aria-label": `${ready} of ${t.n} ready` },
            h("i", { style: { width: `${Math.round(Math.min(1, t.xp / (t.n * need)) * 100)}%` } }),
          )
        : null;
      body.push(unit(troop(t.type).name, String(t.n), sub, bar, ups));
    }
    if (p.party.prisoners.length) {
      body.push(label("Prisoners"));
      p.party.prisoners.forEach((pr, k) => {
        const r = prisonerRoom(state, k);
        const as = shortName(r.as).toLowerCase();
        const sub =
          r.why === "days"
            ? `will join you from ${when(r.ready, state.t)}`
            : `would join as ${as}s for ${costText(r.cost)} each`;
        body.push(
          row(prisonerWords(pr.type, pr.n), sub, [
            btn("Free", () => onRelease(k), { tip: "Free: let them go. Prisoners slow you down." }),
            r.n > 0
              ? btn(`Take ×${r.n}`, () => onTakeOn(k), {
                  cls: "on",
                  tip: `Take them on: ${r.n} join you as ${as}s for ${costText(r.cost)} each.`,
                })
              : btn("Take", null, {
                  disabled: true,
                  tip: `Take them on: ${WHY[r.why]}. Sell them at a town's broker.`,
                }),
          ]),
        );
      });
    }
    return sheetBox("Army", body, [back()]);
  }

  function logSheet() {
    const lines = [...state.journal].reverse().map((e) => {
      const p = realm.places[e.id];
      const name = p ? describePlace(p).title : "";
      const text =
        e.k === "won"
          ? `Beat ${e.name}${e.loot ? `: ${e.loot} gold in loot` : ""}.`
          : e.k === "lost"
            ? e.held
              ? `Beaten by ${e.name} and taken. Your warband scattered.`
              : `Beaten by ${e.name}. Your warband scattered.`
            : e.k === "week"
              ? `The week's wages: ${e.paid} of ${e.due} gold paid${e.deserted ? `; ${e.deserted} deserted` : ""}.`
              : e.k === "freed"
                ? e.gold
                  ? `Ransomed for ${e.gold} gold, and let go near ${name}.`
                  : `Escaped, near ${name}.`
                : e.k === "arms"
                  ? `Took up abandoned arms near ${nearestName(p.i)}.`
                  : e.k === "draw"
                    ? `Fought ${e.name} to a standstill.`
                    : e.k === "paid"
                      ? `Paid ${e.name} ${e.gold} gold to let you be.`
                      : e.k === "rearguard"
                        ? `Left ${e.men} men behind to hold off ${e.name}.`
                        : e.k === "pickup"
                          ? `Picked up ${pickupWords(p)} near ${nearestName(p.i)}.`
                          : e.k === "start"
                            ? `You set out from ${name}.`
                            : e.k === "arrive"
                              ? `Reached ${name}.`
                              : e.k === "tower"
                                ? `Climbed the watchtower near ${nearestName(p.i)}.`
                                : `Found ${name}${p.kind === "town" || p.kind === "castle" ? `, a ${CULTURES[p.culture].name} ${p.kind}` : ""}.`;
      return h(
        "div",
        { class: "cl-log-row" },
        h("small", { class: "cl-dim" }, `Day ${dayOf(e.t)} · ${clock(e.t)}`),
        h("div", {}, text),
      );
    });
    return sheetBox("Log", [h("h2", {}, "Journal"), lines], [back()]);
  }

  function nearestName(i) {
    let best = null;
    let bd = Infinity;
    for (const p of realm.places) {
      if (p.kind !== "town" && p.kind !== "castle" && p.kind !== "village") continue;
      const d = dist(realm.grid, p.i, i);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best ? best.name : "here";
  }

  function menuSheet() {
    return sheetBox(
      "Menu",
      [
        h("h2", {}, "Campaign"),
        h(
          "p",
          { class: "cl-dim" },
          `Day ${dayOf(state.t)} · realm ${state.seed}. Saved as you go: close the app at any moment and Continue picks up here.`,
        ),
      ],
      [
        back(),
        btn("Title screen", leave, {
          tip: "Title screen: your campaign is saved; Continue brings you back.",
        }),
      ],
    );
  }

  function newSheet() {
    const choice = (label, options, value, onPick) =>
      h(
        "div",
        { class: "cl-field" },
        h("div", { class: "cl-label" }, label),
        h(
          "div",
          { class: "cl-seg cl-seg-2", role: "group", "aria-label": label },
          options.map(([v, text, sub]) =>
            h(
              "button",
              {
                type: "button",
                class: `cl-opt${v === value ? " on" : ""}`,
                "aria-pressed": v === value ? "true" : "false",
                "data-tip": `${text}: ${sub}`,
                onClick: () => onPick(v),
              },
              h("span", {}, text),
              h("small", {}, sub),
            ),
          ),
        ),
      );
    const existing = readCampaign(store.get("campaign", null));
    return h(
      "div",
      { class: "cl-sheet", role: "dialog", "aria-label": "New campaign" },
      h(
        "div",
        { class: "cl-body" },
        h("h2", {}, "New campaign"),
        h(
          "p",
          { class: "cl-dim" },
          `You start at ${realm.places[realm.placeAt[state.player.at.i]].name} with 12 levies and a hero. The realm is new each time.`,
        ),
        choice(
          "Home culture",
          CULTURE_IDS.map((c) => [c, CULTURES[c].name, CULTURES[c].doctrine]),
          draft.culture,
          (v) => {
            draft.culture = v;
            rebuildDraft();
            render();
          },
        ),
        choice(
          "Background",
          Object.entries(BACKGROUNDS).map(([k, b]) => [k, b.name, b.text]),
          draft.background,
          (v) => {
            draft.background = v;
            rebuildDraft();
            render();
          },
        ),
        existing
          ? h(
              "p",
              { class: "cl-warn-line" },
              `This replaces your campaign on day ${dayOf(existing.t)}.`,
            )
          : null,
      ),
      h(
        "div",
        { class: "cl-actions" },
        btn("Back", () => {
          active = false;
          state = null;
          onExit();
        }),
        btn("Begin ▶", begin, { cls: "primary" }),
      ),
    );
  }

  return {
    get active() {
      return active;
    },
    openNew,
    resume,
    frame,
    render,
    /** The saved campaign, if this version can continue it. */
    saved: () => readCampaign(store.get("campaign", null)),
  };
}
