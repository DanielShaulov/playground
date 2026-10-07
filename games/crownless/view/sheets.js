/**
 * Everything you press (tech.md §6, ui.md §4–5): DOM, absolutely placed in
 * .stage over the canvas, rebuilt from state on every change. Buttons carry
 * their visible names, which is also how the browser tests find them.
 *
 * Nothing here decides an outcome: each sheet is given what to show and what
 * to call.
 */
import { BAR } from "./layout.js";
import { glyphSVG, squadName } from "./theme.js";
import { CULTURES, troop } from "../rules/data/troops.js";
import { DOCTRINES, PRESETS } from "../rules/battle-setup.js";
import { ABILITIES } from "../rules/battle.js";

/** createElement with props and children; `on*` props become listeners. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function")
      el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = v;
    else if (k === "style") Object.assign(el.style, v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

const button = (label, onClick, { cls = "", disabled = false, aria, title } = {}) =>
  h(
    "button",
    {
      type: "button",
      class: `cl-btn ${cls}`,
      disabled,
      "aria-label": aria,
      title,
      onClick: (e) => {
        e.stopPropagation();
        if (!disabled) onClick?.();
      },
    },
    label,
  );

/** A row of mutually exclusive choices. */
function choices(label, options, value, onPick) {
  return h(
    "div",
    { class: "cl-field" },
    h("div", { class: "cl-label" }, label),
    h(
      "div",
      { class: "cl-seg", role: "group", "aria-label": label },
      options.map(([v, text, sub]) =>
        h(
          "button",
          {
            type: "button",
            class: `cl-opt${v === value ? " on" : ""}`,
            "aria-pressed": v === value ? "true" : "false",
            onClick: () => onPick(v),
          },
          h("span", {}, text),
          sub ? h("small", {}, sub) : null,
        ),
      ),
    ),
  );
}

/** "7 footmen", "1 archer", "12 militia": a troop's name for a count of them. */
export function troopWord(id, n) {
  const t = troop(id);
  const word = t.culture ? CULTURES[t.culture].word + " " : "";
  let name = t.name.startsWith(word) ? t.name.slice(word.length) : t.name;
  name = name.toLowerCase();
  if (n === 1 || /militia|hearthguard|keshig/.test(name)) return name;
  if (/man$/.test(name)) return name.replace(/man$/, "men");
  if (name === "man-at-arms") return "men-at-arms";
  if (/y$/.test(name)) return name.replace(/y$/, "ies");
  return `${name}s`;
}

export const troopList = (troops) =>
  Object.entries(troops)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${n} ${troopWord(t, n)}`)
    .join(", ");

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

export function titleSheet({ canContinue, continueText, best, nudge, onContinue, onSkirmish }) {
  return h(
    "div",
    { class: "cl-title" },
    h("h1", {}, "Crownless"),
    h("p", { class: "cl-sub" }, "The king is dead and the crown is lost."),
    best
      ? h(
          "p",
          { class: "cl-best" },
          "Toughest win: ",
          h("b", {}, best.word),
          ` (${best.wins} of 8) — ${best.label}`,
        )
      : h("p", { class: "cl-best" }, "Win a skirmish against the odds to set a record."),
    h(
      "div",
      { class: "cl-stack" },
      canContinue ? button(continueText, onContinue, { cls: "primary" }) : null,
      button("Skirmish", onSkirmish, { cls: canContinue ? "" : "primary" }),
    ),
    nudge
      ? h("p", { class: "cl-nudge" }, "Add to Home Screen to keep your games on this phone.")
      : null,
  );
}

// ---------------------------------------------------------------------------
// Skirmish setup
// ---------------------------------------------------------------------------

const WORTHS = [60, 100, 150, 200];
const HEROES = [0, 1, 5, 10, 20];

export function setupSheet({ setup, editing, preview, odds, onEdit, onChange, onBack, onDeploy }) {
  const sd = setup.sides[editing];
  const set = (k) => (v) => onChange(editing, k, v);
  const sideTab = (i, name) =>
    h(
      "button",
      {
        type: "button",
        class: `cl-tab${i === editing ? " on" : ""}`,
        "aria-pressed": i === editing ? "true" : "false",
        onClick: () => onEdit(i),
      },
      name,
    );
  const line = (i) => {
    const p = preview[i];
    return h(
      "div",
      { class: "cl-army" },
      h("b", {}, i === 0 ? "You" : "Them"),
      ` · ${CULTURES[setup.sides[i].culture].name} · ${p.men} men · strength ${Math.round(p.worth)}`,
      setup.sides[i].hero ? ` · hero ${setup.sides[i].hero}` : "",
      h("div", { class: "cl-dim" }, p.list),
    );
  };
  let oddsLine;
  if (!odds) oddsLine = h("p", { class: "cl-odds" }, "Odds: working them out…");
  else {
    const lose = troopList(odds.losses);
    oddsLine = h(
      "p",
      { class: "cl-odds" },
      "Odds: ",
      h("b", {}, odds.word),
      ` (${odds.wins} of ${odds.runs})`,
      lose ? ` · you'd lose about ${lose}` : " · you'd lose almost no one",
    );
  }
  return h(
    "div",
    { class: "cl-sheet", role: "dialog", "aria-label": "Skirmish" },
    h(
      "div",
      { class: "cl-body" },
      h("h2", {}, "Skirmish"),
      oddsLine,
      h("div", { class: "cl-tabs" }, sideTab(0, "Your army"), sideTab(1, "Their army")),
      choices(
        "Culture",
        Object.values(CULTURES).map((c) => [c.id, c.name]),
        sd.culture,
        set("culture"),
      ),
      h(
        "p",
        { class: "cl-dim cl-note" },
        `${CULTURES[sd.culture].doctrine}. ${CULTURES[sd.culture].trait.name}: ${CULTURES[sd.culture].trait.text}.`,
      ),
      choices(
        "Doctrine",
        [...Object.entries(DOCTRINES).map(([id, d]) => [id, d.name]), ["random", "Random"]],
        sd.doctrine,
        set("doctrine"),
      ),
      choices(
        "Strength",
        WORTHS.map((w) => [w, String(w)]),
        sd.worth,
        set("worth"),
      ),
      choices(
        "Hero level",
        HEROES.map((l) => [l, l ? String(l) : "None"]),
        sd.hero,
        set("hero"),
      ),
      choices(
        "Field",
        [
          ["open", "Open"],
          ["woods", "Woods"],
        ],
        setup.terrain,
        (v) => onChange(null, "terrain", v),
      ),
      line(0),
      line(1),
    ),
    h(
      "div",
      { class: "cl-actions" },
      button("Back", onBack),
      button("Deploy ▶", onDeploy, { cls: "primary" }),
    ),
  );
}

// ---------------------------------------------------------------------------
// The command bar (ui.md §5)
// ---------------------------------------------------------------------------

function chip(s, { selected, onClick, enemy = false, near = null }) {
  const routing = s.state === "routing";
  const name = s.banner ? (enemy ? "Lord" : "Banner") : squadName(s, troop);
  const moraleK = Math.max(0, Math.min(1, s.morale / Math.max(1, s.cap)));
  const tone = moraleK > 0.55 ? "ok" : moraleK > 0.3 ? "warn" : "bad";
  const pips = [];
  if (s.ammo0) {
    const k = Math.ceil((s.ammo / s.ammo0) * 4);
    for (let i = 0; i < 4; i++) pips.push(h("i", { class: i < k ? "on" : "" }));
  }
  return h(
    "button",
    {
      type: "button",
      class: `cl-chip${selected ? " sel" : ""}${enemy ? " foe" : ""}`,
      "aria-pressed": selected ? "true" : "false",
      "data-squad": s.id,
      onClick: (e) => {
        e.stopPropagation();
        onClick();
      },
    },
    h(
      "span",
      { class: "cl-chip-top" },
      h("span", { class: "cl-glyph", html: glyphSVG(s.role, s.banner && !enemy) }),
      h("span", { class: "cl-chip-name" }, name),
      s.state === "wavering" ? h("span", { class: "cl-warn", title: "wavering" }, "!") : null,
    ),
    h(
      "span",
      { class: "cl-chip-mid" },
      h("b", { class: routing ? "runs" : "" }, routing ? "runs" : `${s.n}`),
      near != null ? h("small", {}, `${Math.round(near)} m`) : null,
      pips.length ? h("span", { class: "cl-pips" }, pips) : null,
    ),
    h(
      "span",
      { class: `cl-morale ${tone}` },
      h("i", { style: { width: `${Math.round(moraleK * 100)}%` } }),
    ),
  );
}

/**
 * @param o.phase "deploy" | "plan" | "play"
 * @param o.mode "squads" | "target"
 */
export function commandBar(o) {
  const bar = h("div", { class: "cl-bar", style: { height: `${o.height}px` } });
  bar.style.setProperty("--chips", `${BAR.chips}px`);
  bar.style.setProperty("--orders", `${BAR.orders}px`);
  bar.style.setProperty("--actions", `${BAR.actions}px`);
  const busy = o.phase === "play";

  // Row 1: your squads, or theirs when picking a target.
  const chips = h("div", { class: "cl-row cl-chips" });
  if (o.mode === "target") {
    chips.append(button("Any", o.onTargetAny, { cls: "cl-chip small", aria: "Any target" }));
    for (const { s, d } of o.enemies)
      chips.append(
        chip(s, {
          enemy: true,
          near: d,
          selected: o.targetOf === s.id,
          onClick: () => o.onTarget(s.id),
        }),
      );
    chips.append(button("Done", o.onTargetDone, { cls: "cl-chip small" }));
  } else {
    chips.append(
      button("All", o.onAll, {
        cls: `cl-chip small${o.allSelected ? " sel" : ""}`,
        aria: "All squads",
      }),
    );
    for (const s of o.squads)
      chips.append(chip(s, { selected: o.selected.has(s.id), onClick: () => o.onChip(s.id) }));
  }

  // Row 2: orders, or formation presets while deploying.
  const orders = h("div", { class: "cl-row cl-orders" });
  if (o.phase === "deploy") {
    for (const [id, p] of Object.entries(PRESETS))
      orders.append(
        button(p.name, () => o.onPreset(id), { cls: o.preset === id ? "on" : "", title: p.text }),
      );
  } else {
    const k = o.current;
    orders.append(
      button("Advance", () => o.onOrder("advance"), {
        cls: k === "advance" ? "on" : "",
        disabled: busy,
      }),
      button("Hold", () => o.onOrder("hold"), { cls: k === "hold" ? "on" : "", disabled: busy }),
      button("Charge", () => o.onOrder("charge"), {
        cls: k === "charge" ? "on" : "",
        disabled: busy,
      }),
      button("Fall back", () => o.onOrder("fallback"), {
        cls: k === "fallback" ? "on" : "",
        disabled: busy,
      }),
    );
  }
  orders.append(
    button("⋯", o.onMore, { cls: "narrow", aria: "More", disabled: busy && o.phase !== "deploy" }),
  );

  // Row 3: abilities, continuous play, Go.
  const actions = h("div", { class: "cl-row cl-actions-row" });
  const abil = h("div", { class: "cl-abilities" });
  if (o.phase !== "deploy") {
    for (const a of o.abilities) {
      const dots = h(
        "span",
        { class: "cl-cost" },
        Array.from({ length: ABILITIES[a.id].cost }, () => h("i")),
      );
      abil.append(
        h(
          "button",
          {
            type: "button",
            class: `cl-btn cl-ability${a.used ? " used" : ""}`,
            disabled: busy || !a.ready,
            title: `${ABILITIES[a.id].name}: ${a.why ?? ABILITIES[a.id].text}`,
            "aria-label": ABILITIES[a.id].name,
            onClick: (e) => {
              e.stopPropagation();
              o.onAbility(a.id);
            },
          },
          h("span", {}, a.used ? `✓ ${ABILITIES[a.id].short}` : ABILITIES[a.id].short),
          dots,
        ),
      );
    }
  }
  actions.append(abil);
  if (o.phase !== "deploy")
    actions.append(
      button(o.continuous ? "⏸" : "⏯", o.onContinuous, {
        cls: `square${o.continuous ? " on" : ""}`,
        aria: o.continuous ? "Stop continuous" : "Continuous",
      }),
    );
  const go = h(
    "button",
    {
      type: "button",
      class: "cl-btn cl-go",
      onClick: (e) => {
        e.stopPropagation();
        o.onGo();
      },
    },
    h("span", { class: "cl-ring", style: { width: `${Math.round((o.progress ?? 0) * 100)}%` } }),
    h(
      "span",
      { class: "cl-go-label" },
      o.phase === "deploy" ? "Begin ▶" : busy ? "Skip ▶▶" : "Go ▶",
    ),
  );
  actions.append(go);
  bar.append(chips, orders, actions);
  return bar;
}

// ---------------------------------------------------------------------------
// ⋯ — the rest of the orders (ui.md §5)
// ---------------------------------------------------------------------------

export function moreSheet(o) {
  const rows = [];
  if (o.squads.length) {
    const roles = new Set(o.squads.map((s) => s.role));
    const all = (f) => o.squads.every(f);
    rows.push(
      choices(
        "Formation",
        [
          ["line", "Line", "wraps"],
          ["wide", "Wide", "can't be wrapped"],
        ],
        all((s) => s.formation === "wide")
          ? "wide"
          : all((s) => s.formation === "line")
            ? "line"
            : null,
        o.onFormation,
      ),
    );
    if (o.squads.some((s) => s.range)) {
      rows.push(
        choices(
          "Fire",
          [
            ["will", "At will"],
            ["hold", "Hold fire"],
          ],
          all((s) => s.cmd?.fire === "hold") ? "hold" : "will",
          o.onFire,
        ),
      );
      rows.push(
        h(
          "div",
          { class: "cl-field" },
          button("Skirmish", o.onSkirmish, {
            title: "keep 60–80% of range from enemy melee, shooting",
          }),
        ),
      );
    }
    if (roles.has("cav"))
      rows.push(
        choices(
          "Cycle charges",
          [
            ["on", "On"],
            ["off", "Off"],
          ],
          all((s) => s.cmd?.cycle === false) ? "off" : "on",
          o.onCycle,
        ),
      );
  } else rows.push(h("p", { class: "cl-dim" }, "Pick a squad for its formation and fire orders."));
  rows.push(
    choices(
      "Camera",
      [
        ["fit", "Whole field"],
        ["follow", "Follow"],
      ],
      o.camera,
      o.onCamera,
    ),
  );
  return h(
    "div",
    { class: "cl-sheet", role: "dialog", "aria-label": "More orders" },
    h(
      "div",
      { class: "cl-body" },
      h(
        "h2",
        {},
        o.squads.length === 1 ? o.title : o.squads.length ? `${o.squads.length} squads` : "Battle",
      ),
      rows,
    ),
    h(
      "div",
      { class: "cl-actions" },
      button("Back", o.onBack),
      o.phase === "deploy"
        ? null
        : button(o.retreatArmed ? "Retreat — sure?" : "Retreat", o.onRetreat, { cls: "danger" }),
      o.phase === "deploy" ? null : button("Auto finish", o.onAuto),
    ),
  );
}

// ---------------------------------------------------------------------------
// The result (battle.md §11)
// ---------------------------------------------------------------------------

export function resultSheet({ heading, sub, sides, record, onTitle, onRematch, onNew }) {
  const table = h(
    "table",
    { class: "cl-result" },
    h(
      "thead",
      {},
      h(
        "tr",
        {},
        h("th", {}, ""),
        sides.map((s) => h("th", {}, s.name)),
      ),
    ),
    h(
      "tbody",
      {},
      [
        ["Fielded", "fielded"],
        ["Killed", "killed"],
        ["Wounded", "wounded"],
        ["Fled", "fled"],
        ["Taken prisoner", "captured"],
      ].map(([label, k]) =>
        h(
          "tr",
          {},
          h("th", {}, label),
          sides.map((s) => h("td", {}, s[k])),
        ),
      ),
    ),
  );
  return h(
    "div",
    { class: "cl-sheet", role: "dialog", "aria-label": "Result" },
    h(
      "div",
      { class: "cl-body" },
      h("h2", { class: "cl-result-head" }, heading),
      h("p", { class: "cl-dim" }, sub),
      table,
      record ? h("p", { class: "cl-record" }, record) : null,
    ),
    h(
      "div",
      { class: "cl-actions" },
      button("Title", onTitle),
      button("New", onNew),
      button("Rematch", onRematch, { cls: "primary" }),
    ),
  );
}
