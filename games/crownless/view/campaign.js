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
  MORNING,
} from "../rules/world.js";
import { readCampaign, makeCampaign } from "../rules/campaign-save.js";
import { TERRAIN, PLACES, LAIRS, PICKUPS, GREAT_LAIRS, CULTURE_IDS } from "../rules/data/world.js";
import { BACKGROUNDS, partyLimit } from "../rules/data/hero.js";
import { CULTURES, troop } from "../rules/data/troops.js";
import {
  mapLayout,
  clampCamera,
  hexUnder,
  hexUnderOverview,
  cameraOn,
  TABS_H,
} from "./map-layout.js";
import { createMapView, partyAt } from "./map-view.js";
import { h } from "./sheets.js";
import { dist } from "../rules/hex.js";

/** An hour of travel on screen, in seconds (world.md §2); ⏩ runs at 3×. */
export const HOUR_S = 0.12;
/** Save this often while time runs, in in-game hours (tech.md §4). */
const SAVE_EVERY = 6;

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
    follow = true;
    prev = null;
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
    sel = i;
    vibrate(6);
    render();
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
        const events = advance(state, realm);
        sinceSave++;
        shown(events);
        if (sinceSave >= SAVE_EVERY) save();
      }
      if (!busy(state)) {
        acc = 0;
        prev = null;
        save();
        render();
      } else refresh();
    } else prev = null;

    let party = partyAt(realm, state.player.at, L.R);
    if (prev) {
      const f = Math.min(1, acc / HOUR_S);
      party = { x: prev.x + (party.x - prev.x) * f, y: prev.y + (party.y - prev.y) * f };
    }
    if (follow) {
      const k = Math.min(1, dt * 4);
      const want = clampCamera(L, realm.grid, party);
      cam = { x: cam.x + (want.x - cam.x) * k, y: cam.y + (want.y - cam.y) * k };
    }
    cam = clampCamera(L, realm.grid, cam);

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
        vibrate(10);
      } else if (e.k === "rested") say("Morning");
    }
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
    if (p.resting)
      return {
        title: "Resting",
        sub: `until ${clock(MORNING)} · tap Stop to break camp`,
        kind: "rest",
      };
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
    return {
      title: d.title,
      sub:
        sel === p.at.i
          ? `You are here · rest until ${clock(MORNING)}?`
          : "Tap the map to choose where to go",
      kind: "idle",
    };
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
        h("div", { class: "cl-ctx-text" }, els.title, els.sub),
        actions,
      ),
    );
    ui.append(tabBar());
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

  function armySheet() {
    const p = state.player;
    const men = menOf(p.party);
    const limit = partyLimit(p.hero, p.renown);
    const wounded = p.party.troops.reduce((m, t) => m + t.wounded, 0);
    return sheetBox(
      "Army",
      [
        h("h2", {}, `Army · ${men} / ${limit}`),
        h(
          "p",
          { class: "cl-dim" },
          `${BACKGROUNDS[p.background].name} of ${CULTURES[p.culture].name}, level ${p.hero.level}` +
            ` · ${wounded} wounded · ${Math.round(pace(p) * 10) / 10} hexes a day`,
        ),
        h(
          "div",
          { class: "cl-list" },
          p.party.troops.map((t) =>
            h(
              "div",
              { class: "cl-list-row" },
              h("span", {}, troop(t.type).name),
              h("b", {}, `${t.n}`),
              t.wounded ? h("small", { class: "cl-dim" }, ` (${t.wounded} wounded)`) : null,
            ),
          ),
        ),
      ],
      [back()],
    );
  }

  function logSheet() {
    const lines = [...state.journal].reverse().map((e) => {
      const p = realm.places[e.id];
      const name = describePlace(p).title;
      const text =
        e.k === "start"
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
