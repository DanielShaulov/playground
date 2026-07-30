/**
 * Firewall Mage — a turn-based RPG about a wizard fighting malware.
 *
 * Nothing here is timed. Threats telegraph exactly what they will do on their
 * next turn, you spend a pool of mana answering, and then they act. Winning is
 * about reading intents and matching a spell's school to what the thing in
 * front of you is weak to — never about tapping fast, which is the whole
 * reason this isn't another wave shooter.
 *
 * The run is a sector map of nodes: intrusions, an elite, a cache, a safe node
 * to rest at, and a Zero-Day at the end. Integrity carries between nodes, so
 * the real resource is how much health you're willing to spend on the next
 * fight. Levels buy stat points, fights drop gear, and all of it — stats,
 * gear, XP, where you are on the map, how hurt you are — is written to
 * localStorage after every node, so a run survives closing the tab.
 *
 * Losing costs the node, not the run. A phone RPG you can lose an hour of is
 * a phone RPG you don't reopen.
 *
 * Everything is canvas, menus included: this is a UI-heavy game, and one
 * drawing path is simpler than a canvas battle wired to DOM chrome. Layout is
 * anchored to the bottom of the screen so the things you tap every turn — the
 * spell grid and End Turn — sit under a thumb on any size phone.
 */

import { createLoop, createInput, vibrate, clamp, rand, randInt } from "../../shared/engine.js";
import { createShell } from "../../shared/ui.js";
import { createStore } from "../../shared/storage.js";

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FG = "#e8ecf4";
const DIM = "#8d98ad";
const RAISED = "#191e29";
const CARD = "#1c2331";
const ACCENT = "#4ade80";
const ACCENT2 = "#60a5fa";
const DANGER = "#f87171";
const GOLD = "#fbbf24";

/** Magic schools. A threat's weakness is the only real puzzle in a fight. */
const SCHOOLS = {
  trace: { name: "Trace", icon: "⚡", color: "#fbbf24" },
  purge: { name: "Purge", icon: "🔥", color: "#fb923c" },
  crypt: { name: "Crypt", icon: "🔑", color: "#a78bfa" },
};

const WEAK_MULT = 1.6;
const RESIST_MULT = 0.55;

/**
 * The spellbook. Six spells, unlocked by level — the grid shows the locked
 * ones too, because seeing what's three levels away is half of why you climb.
 */
const SPELLS = [
  {
    id: "bolt",
    name: "Packet Bolt",
    icon: "⚡",
    school: "trace",
    cost: 1,
    level: 1,
    blurb: (d) => `${6 + d.power} damage`,
    cast: (d, target) => strike(target, 6 + d.power, "trace"),
  },
  {
    id: "firewall",
    name: "Firewall",
    icon: "🛡️",
    school: null,
    cost: 1,
    level: 1,
    blurb: (d) => `${8 + d.ward * 2} block`,
    cast: (d) => {
      hero.block += 8 + d.ward * 2;
      say(`+${8 + d.ward * 2} block`, ACCENT2);
    },
  },
  {
    id: "flame",
    name: "Purge Flame",
    icon: "🔥",
    school: "purge",
    cost: 2,
    level: 2,
    blurb: (d) => `${11 + Math.round(d.power * 1.5)} damage`,
    cast: (d, target) => strike(target, 11 + Math.round(d.power * 1.5), "purge"),
  },
  {
    id: "decrypt",
    name: "Decrypt",
    icon: "🔑",
    school: "crypt",
    cost: 2,
    level: 3,
    blurb: (d) => `${9 + d.power} dmg · pierces`,
    cast: (d, target) => {
      strike(target, 9 + d.power, "crypt", { pierce: true });
      // The counter to Ransomware locking your spellbook is, fittingly, this.
      if (Object.keys(hero.encrypted).length) {
        hero.encrypted = {};
        say("decrypted", "#a78bfa");
      }
    },
  },
  {
    id: "patch",
    name: "Patch",
    icon: "🩹",
    school: null,
    cost: 2,
    level: 5,
    blurb: (d) => `heal ${12 + d.focus * 2}`,
    cast: (d) => {
      const healed = Math.min(12 + d.focus * 2, d.maxHp - hero.hp);
      hero.hp += healed;
      say(`+${healed}`, ACCENT);
    },
  },
  {
    id: "chain",
    name: "Chain Trace",
    icon: "🌩️",
    school: "trace",
    cost: 3,
    level: 7,
    blurb: (d) => `${7 + d.power} damage to all`,
    cast: (d) => {
      for (const e of [...battle.enemies]) strike(e, 7 + d.power, "trace");
    },
  },
];

/**
 * Threats. `moves` is a fixed cycle rather than a random roll — a telegraphed
 * pattern is something you can play around, which is what makes the fight a
 * puzzle instead of a coin flip.
 */
const THREATS = {
  virus: {
    name: "Virus",
    hp: 24,
    armor: 0,
    weak: "purge",
    resist: "trace",
    xp: 8,
    moves: [
      { type: "attack", value: 6 },
      { type: "attack", value: 6 },
      { type: "grow", value: 3, label: "Replicate" },
    ],
  },
  worm: {
    name: "Worm",
    hp: 18,
    armor: 0,
    weak: "trace",
    resist: null,
    xp: 7,
    // Every turn it burrows deeper: ignore it and the numbers get silly.
    moves: [
      { type: "attack", value: 4 },
      { type: "grow", value: 3, label: "Burrow" },
      { type: "attack", value: 4 },
    ],
  },
  phish: {
    name: "Phish",
    hp: 22,
    armor: 1,
    weak: "crypt",
    resist: "purge",
    xp: 9,
    moves: [
      { type: "drain", value: 1, label: "Harvest" },
      { type: "leech", value: 6, label: "Bait" },
      { type: "attack", value: 7 },
    ],
  },
  trojan: {
    name: "Trojan",
    hp: 38,
    armor: 3,
    weak: "purge",
    resist: "crypt",
    xp: 14,
    payload: "virus",
    moves: [
      { type: "attack", value: 9 },
      { type: "attack", value: 9 },
      { type: "shield", value: 6, label: "Harden" },
    ],
  },
  botnet: {
    name: "Botnet",
    hp: 34,
    armor: 1,
    weak: "trace",
    resist: null,
    xp: 15,
    moves: [
      { type: "summon", value: 1, label: "Recruit" },
      { type: "attack", value: 5 },
      { type: "attack", value: 5 },
    ],
  },
  drone: {
    name: "Drone",
    hp: 9,
    armor: 0,
    weak: null,
    resist: null,
    xp: 3,
    moves: [{ type: "attack", value: 4 }],
  },
  ransom: {
    name: "Ransomware",
    hp: 46,
    armor: 4,
    weak: "crypt",
    resist: "purge",
    xp: 20,
    moves: [
      { type: "encrypt", value: 2, label: "Encrypt" },
      { type: "attack", value: 12 },
      { type: "attack", value: 12 },
    ],
  },
  zeroday: {
    name: "Zero-Day",
    hp: 96,
    armor: 3,
    weak: null,
    resist: "trace",
    xp: 60,
    boss: true,
    moves: [
      { type: "attack", value: 11 },
      { type: "encrypt", value: 2, label: "Encrypt" },
      { type: "attack", value: 11 },
      { type: "attack", value: 24, label: "Exploit", heavy: true },
    ],
  },
};

/** Loot tables. Three slots, three rarities, mods rolled from the slot's pool. */
const SLOTS = {
  staff: {
    label: "Staff",
    icon: "🪄",
    names: ["Debug Wand", "Null Pointer", "Root Staff", "Cipher Rod", "Kernel Branch"],
    pool: ["power", "power", "crit"],
  },
  robe: {
    label: "Robe",
    icon: "🧥",
    names: ["Sandbox Robe", "Patched Cloak", "Airgap Mantle", "Bastion Vest", "Layered Shroud"],
    pool: ["hp", "hp", "ward"],
  },
  sigil: {
    label: "Sigil",
    icon: "💠",
    names: ["Hash Sigil", "Token Charm", "Entropy Seal", "Root Cert", "Handshake Rune"],
    pool: ["focus", "crit", "hp", "ward"],
  },
};

const RARITIES = [
  { id: "common", name: "Common", color: "#94a3b8", mods: 1 },
  { id: "rare", name: "Rare", color: "#60a5fa", mods: 2 },
  { id: "epic", name: "Epic", color: "#c084fc", mods: 3 },
];

const MOD_LABEL = { power: "Power", ward: "Ward", focus: "Focus", hp: "Integrity", crit: "Crit" };

const SECTOR_NAMES = [
  "Mail Gateway",
  "Payment Rail",
  "Build Pipeline",
  "Identity Vault",
  "Kernel Space",
];

/** A sector is always the same shape, so you always know how far the boss is. */
const NODE_PLAN = ["fight", "fight", "cache", "fight", "rest", "fight", "elite", "boss"];
const NODE_INFO = {
  fight: { name: "Intrusion", icon: "🦠" },
  elite: { name: "Persistent Threat", icon: "🕷️" },
  cache: { name: "Data Cache", icon: "📦" },
  rest: { name: "Safe Node", icon: "🕯️" },
  boss: { name: "Zero-Day", icon: "💀" },
};

const shell = createShell({ title: "Firewall Mage", stats: ["Sector", "Node", "Lv"] });
const { stage } = shell;
const ctx = stage.ctx;
const store = createStore("firewall-mage");

/* ------------------------------------------------------------------ save -- */

const SAVE_V = 2;
const freshSave = () => ({
  v: SAVE_V,
  sector: 1,
  node: 0, // index into NODE_PLAN
  best: 1, // deepest sector reached
  level: 1,
  xp: 0,
  points: 0,
  stats: { power: 0, ward: 0, focus: 0 },
  gear: { staff: null, robe: null, sigil: null },
  hp: null, // null means "start full"
});

function load() {
  const raw = store.get("save", null);
  // v1 was a different game entirely; there's nothing sensible to migrate.
  if (!raw || raw.v !== SAVE_V) return freshSave();
  return {
    ...freshSave(),
    ...raw,
    stats: { ...freshSave().stats, ...raw.stats },
    gear: { ...freshSave().gear, ...raw.gear },
  };
}

let save = load();

function persist() {
  save.best = Math.max(save.best, save.sector);
  save.hp = Math.round(hero.hp);
  store.set("save", save);
  syncHud();
}

function syncHud() {
  shell.setStat("Sector", save.sector);
  shell.setStat("Node", `${Math.min(save.node + 1, NODE_PLAN.length)}/${NODE_PLAN.length}`);
  shell.setStat("Lv", save.level);
}

const xpNeed = (level) => 40 + (level - 1) * 26;
const sectorName = () => SECTOR_NAMES[(save.sector - 1) % SECTOR_NAMES.length];

/** Everything the hero's numbers are made of: base + stat points + gear. */
function derived() {
  const g = { power: 0, ward: 0, focus: 0, hp: 0, crit: 0 };
  for (const item of Object.values(save.gear)) {
    if (!item) continue;
    for (const [mod, value] of Object.entries(item.mods)) g[mod] += value;
  }
  const ward = save.stats.ward + g.ward;
  const focus = save.stats.focus + g.focus;
  return {
    power: 2 + save.stats.power + g.power,
    ward,
    focus,
    crit: g.crit / 100,
    maxHp: 55 + 9 * save.level + 7 * ward + g.hp,
    maxMana: 3 + Math.floor(focus / 3),
  };
}

const learned = (spell) => save.level >= spell.level;

/* ----------------------------------------------------------------- state -- */

let scene = "home"; // home | map | battle | reward | loot | character | defeat
let hero = { hp: 0, block: 0, mana: 0, encrypted: {}, drain: 0 };
let battle = null;
let reward = null; // { xp, levels, item }
let floaters = [];
let particles = [];
let shake = 0;
let elapsed = 0;
let banner = null; // { text, life }
let confirmReset = false;
let hits = []; // tappable rects, rebuilt every frame while drawing

// Gear can come off between sessions, so a stored value can outrun the cap.
hero.hp = clamp(save.hp ?? derived().maxHp, 1, derived().maxHp);

/* ---------------------------------------------------------------- layout -- */

/**
 * Bottom-anchored: the spell grid and End Turn are pinned above the safe area
 * and everything else takes the space that's left, so the two things you tap
 * every single turn land under a thumb on a small phone and a large one alike.
 */
function layout() {
  const W = stage.width;
  const H = stage.height;
  const pad = 12;
  const endTurn = { x: pad, y: H - 70, w: W - pad * 2, h: 58 };
  const rowH = clamp((H - 300) / 6, 52, 66);
  const gridH = rowH * 3 + 16;
  const grid = { x: pad, y: endTurn.y - 12 - gridH, w: W - pad * 2, h: gridH, rowH };
  const strip = { x: pad, y: grid.y - 74, w: W - pad * 2, h: 62 };
  const field = { x: 0, y: 52, w: W, h: strip.y - 60 };
  return { W, H, pad, endTurn, grid, strip, field };
}

/* ------------------------------------------------------------ combat maths -- */

function say(text, color, at = null) {
  const L = layout();
  floaters.push({
    x: at ? at.x : L.W / 2,
    y: at ? at.y : L.strip.y - 10,
    text,
    color,
    life: 1.1,
    size: 18,
  });
}

function burst(x, y, color, count = 10) {
  for (let i = 0; i < count && particles.length < 160; i++) {
    const a = rand(0, Math.PI * 2);
    const speed = rand(30, 150);
    particles.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: rand(0.2, 0.5),
      max: 0.5,
      color,
      size: rand(1.6, 3.2),
    });
  }
}

/** Where an enemy is drawn — floaters and particles need to find it. */
function enemyAnchor(enemy) {
  const L = layout();
  const i = battle.enemies.indexOf(enemy);
  const n = Math.max(1, battle.enemies.length);
  const w = Math.min(120, (L.W - 24) / n - 8);
  const total = n * w + (n - 1) * 8;
  const x = (L.W - total) / 2 + i * (w + 8) + w / 2;
  return { x, y: L.field.y + 92, w };
}

function strike(enemy, amount, school, { pierce = false } = {}) {
  if (!enemy || enemy.hp <= 0) return;
  const d = derived();
  let dmg = amount;
  let note = "";

  if (school && enemy.weak === school) {
    dmg = Math.round(dmg * WEAK_MULT);
    note = " WEAK";
  } else if (school && enemy.resist === school) {
    dmg = Math.round(dmg * RESIST_MULT);
    note = " resist";
  }
  const crit = Math.random() < d.crit;
  if (crit) dmg = Math.round(dmg * 1.6);
  if (!pierce) dmg = Math.max(1, dmg - enemy.armor);
  if (enemy.shield > 0) {
    const absorbed = Math.min(enemy.shield, dmg);
    enemy.shield -= absorbed;
    dmg -= absorbed;
  }

  enemy.hp -= dmg;
  enemy.flash = 0.16;
  const at = enemyAnchor(enemy);
  floaters.push({
    x: at.x,
    y: at.y,
    text: `${dmg}${crit ? "!" : ""}${note}`,
    color: note === " WEAK" || crit ? GOLD : note ? DIM : FG,
    life: 0.9,
    size: note === " WEAK" || crit ? 22 : 18,
  });
  burst(at.x, at.y, school ? SCHOOLS[school].color : FG, 8);
  vibrate(8);

  if (enemy.hp <= 0) defeatEnemy(enemy);
}

function defeatEnemy(enemy) {
  const idx = battle.enemies.indexOf(enemy);
  if (idx === -1) return;
  const at = enemyAnchor(enemy);
  battle.enemies.splice(idx, 1);
  burst(at.x, at.y, DANGER, 18);
  battle.xp += enemy.xp;

  // A trojan is a delivery mechanism: killing it is when the payload lands.
  if (enemy.payload && battle.enemies.length < 4) {
    const spawned = makeEnemy(enemy.payload, battle.sector);
    battle.enemies.push(spawned);
    rollIntent(spawned);
    say("payload deployed", DANGER);
  }
  battle.target = clamp(battle.target, 0, Math.max(0, battle.enemies.length - 1));
}

function hurtHero(amount, label) {
  let dmg = amount;
  if (hero.block > 0) {
    const absorbed = Math.min(hero.block, dmg);
    hero.block -= absorbed;
    dmg -= absorbed;
    if (absorbed) say(`blocked ${absorbed}`, ACCENT2);
  }
  if (dmg <= 0) return;
  hero.hp = Math.max(0, hero.hp - dmg);
  shake = 12;
  vibrate(24);
  say(`−${dmg}${label ? ` ${label}` : ""}`, DANGER);
  if (hero.hp <= 0) endBattle(false);
}

/* ---------------------------------------------------------------- enemies -- */

function makeEnemy(kind, sector) {
  const t = THREATS[kind];
  const hpMul = 1 + 0.28 * (sector - 1);
  const dmgMul = 1 + 0.16 * (sector - 1);
  const hp = Math.round(t.hp * hpMul);
  return {
    kind,
    name: t.name,
    hp,
    maxHp: hp,
    armor: t.armor,
    weak: t.weak,
    resist: t.resist,
    xp: Math.round(t.xp * (1 + 0.15 * (sector - 1))),
    payload: t.payload,
    boss: !!t.boss,
    moves: t.moves,
    dmgMul,
    moveIdx: 0,
    bonus: 0,
    shield: 0,
    flash: 0,
    intent: null,
    wobble: rand(0, 6),
  };
}

function rollIntent(enemy) {
  const move = enemy.moves[enemy.moveIdx % enemy.moves.length];
  enemy.intent = {
    ...move,
    // Damage is shown exactly, including buffs, so the plan is never a guess.
    shown:
      move.type === "attack" ? Math.round(move.value * enemy.dmgMul) + enemy.bonus : move.value,
  };
}

const INTENT_ICON = {
  attack: "⚔️",
  grow: "🧬",
  shield: "🛡️",
  summon: "🕸️",
  encrypt: "🔒",
  drain: "💧",
  leech: "🩸",
};

function resolveIntent(enemy) {
  const intent = enemy.intent;
  if (!intent) return;
  const at = enemyAnchor(enemy);

  if (intent.type === "attack") {
    hurtHero(intent.shown, enemy.name);
  } else if (intent.type === "grow") {
    enemy.bonus += intent.value;
    floaters.push({
      x: at.x,
      y: at.y,
      text: `+${intent.value} dmg`,
      color: DANGER,
      life: 0.9,
      size: 16,
    });
  } else if (intent.type === "shield") {
    enemy.shield += intent.value;
    floaters.push({
      x: at.x,
      y: at.y,
      text: `+${intent.value} shield`,
      color: ACCENT2,
      life: 0.9,
      size: 16,
    });
  } else if (intent.type === "summon") {
    if (battle.enemies.length < 4) {
      const drone = makeEnemy("drone", battle.sector);
      battle.enemies.push(drone);
      rollIntent(drone);
    }
  } else if (intent.type === "encrypt") {
    const open = SPELLS.filter((s) => learned(s) && !hero.encrypted[s.id]);
    if (open.length) {
      const victim = open[randInt(0, open.length - 1)];
      hero.encrypted[victim.id] = intent.value + 1; // +1: this turn doesn't count
      say(`${victim.name} encrypted`, "#c084fc");
    }
  } else if (intent.type === "drain") {
    hero.drain += intent.value;
    say(`−${intent.value} mana next turn`, "#c084fc");
  } else if (intent.type === "leech") {
    const before = hero.hp;
    hurtHero(Math.round(intent.value * enemy.dmgMul), enemy.name);
    const dealt = before - hero.hp;
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + dealt);
    if (dealt) {
      floaters.push({ x: at.x, y: at.y, text: `+${dealt}`, color: ACCENT, life: 0.9, size: 16 });
    }
  }

  enemy.moveIdx++;
}

/* ----------------------------------------------------------------- battle -- */

function nodeType() {
  return NODE_PLAN[Math.min(save.node, NODE_PLAN.length - 1)];
}

/** Who shows up, by node type and how deep the sector is. */
function rosterFor(type, sector) {
  const early = ["virus", "worm"];
  const mid = ["virus", "worm", "phish"];
  const late = ["virus", "worm", "phish", "trojan", "botnet", "ransom"];
  const pool =
    sector === 1 ? (save.node < 3 ? early : mid) : sector === 2 ? mid.concat("trojan") : late;
  const pick = () => pool[randInt(0, pool.length - 1)];

  if (type === "boss") return ["zeroday"];
  if (type === "elite") return [sector >= 3 ? "ransom" : "trojan", pick()];
  const count =
    save.node < 2 && sector === 1 ? 1 : randInt(1, Math.min(3, 1 + Math.floor(sector / 1.5) + 1));
  return Array.from({ length: count }, pick);
}

function startBattle() {
  const type = nodeType();
  const d = derived();
  battle = {
    sector: save.sector,
    type,
    enemies: rosterFor(type, save.sector).map((kind) => makeEnemy(kind, save.sector)),
    turn: 1,
    phase: "player",
    target: 0,
    timer: 0,
    queue: [],
    xp: 0,
  };
  hero.block = 0;
  hero.mana = d.maxMana;
  hero.encrypted = {};
  hero.drain = 0;
  for (const e of battle.enemies) rollIntent(e);
  banner = { text: type === "boss" ? "ZERO-DAY" : NODE_INFO[type].name, life: 1.4 };
  scene = "battle";
}

function castSpell(spell) {
  if (battle.phase !== "player" || banner) return;
  if (!learned(spell) || hero.encrypted[spell.id] || hero.mana < spell.cost) return;
  const target = battle.enemies[battle.target];
  if (!target && spell.school) return; // nothing left to hit

  hero.mana -= spell.cost;
  vibrate(12);
  spell.cast(derived(), target);
  if (!battle.enemies.length) endBattle(true);
}

function endTurn() {
  if (battle.phase !== "player" || banner) return;
  battle.phase = "enemy";
  battle.queue = [...battle.enemies];
  battle.timer = 0.35;
}

function startPlayerTurn() {
  const d = derived();
  battle.turn++;
  battle.phase = "player";
  hero.block = 0;
  hero.mana = Math.max(1, d.maxMana - hero.drain);
  hero.drain = 0;
  for (const id of Object.keys(hero.encrypted)) {
    if (--hero.encrypted[id] <= 0) delete hero.encrypted[id];
  }
  for (const e of battle.enemies) rollIntent(e);
}

function endBattle(won) {
  if (!won) {
    battle.phase = "lost";
    scene = "defeat";
    // The retry is banked as already rested: quitting on the defeat screen
    // must not resume the node with a sliver of integrity.
    hero.hp = derived().maxHp;
    persist();
    return;
  }

  battle.phase = "won";
  const bonus =
    8 + save.sector * 5 + (battle.type === "boss" ? 40 : battle.type === "elite" ? 18 : 0);
  const gained = battle.xp + bonus;
  const levels = gainXp(gained);
  reward = { xp: gained, levels, item: rollLoot(battle.type) };
  scene = "reward";
  advanceNode();
}

function gainXp(amount) {
  save.xp += amount;
  let levels = 0;
  while (save.xp >= xpNeed(save.level)) {
    save.xp -= xpNeed(save.level);
    save.level++;
    save.points++;
    levels++;
    // Levelling patches you up a little — otherwise the reward for a hard
    // fight is a bigger health bar you have no way to fill.
    hero.hp = Math.min(derived().maxHp, hero.hp + Math.round(derived().maxHp * 0.2));
  }
  return levels;
}

function advanceNode() {
  save.node++;
  if (save.node >= NODE_PLAN.length) {
    save.node = 0;
    save.sector++;
  }
  persist();
}

/* ------------------------------------------------------------------- loot -- */

function rollLoot(type) {
  if (type === "rest") return null;
  const guaranteed = type === "boss" || type === "elite" || type === "cache";
  if (!guaranteed && Math.random() > 0.45) return null;

  const slotId = ["staff", "robe", "sigil"][randInt(0, 2)];
  const slot = SLOTS[slotId];
  const roll =
    Math.random() + (type === "boss" ? 0.45 : type === "elite" ? 0.2 : 0) + save.sector * 0.03;
  const rarity = roll > 1.05 ? RARITIES[2] : roll > 0.72 ? RARITIES[1] : RARITIES[0];

  const mods = {};
  const bag = [...slot.pool];
  for (let i = 0; i < rarity.mods && bag.length; i++) {
    const mod = bag.splice(randInt(0, bag.length - 1), 1)[0];
    // A pool lists its favoured mod twice for weighting, so rolling the same
    // one again stacks into a bigger number rather than silently vanishing.
    mods[mod] = (mods[mod] || 0) + modRoll(mod, save.sector);
  }
  return {
    slot: slotId,
    name: slot.names[randInt(0, slot.names.length - 1)],
    rarity: rarity.id,
    mods,
  };
}

function modRoll(mod, sector) {
  const step = Math.floor((sector - 1) / 2);
  if (mod === "hp") return randInt(6, 12) + step * 4;
  if (mod === "crit") return randInt(3, 7) + step;
  if (mod === "power") return randInt(1, 2) + step;
  return randInt(1, 2) + Math.floor(step / 2);
}

const rarityOf = (item) => RARITIES.find((r) => r.id === item.rarity) ?? RARITIES[0];
const itemLines = (item) =>
  Object.entries(item.mods).map(
    ([mod, value]) => `+${value}${mod === "crit" ? "%" : ""} ${MOD_LABEL[mod]}`,
  );

function equip(item) {
  const before = derived().maxHp;
  save.gear[item.slot] = item;
  // Gear that raises max integrity hands you the difference, so swapping a
  // robe mid-sector isn't a downgrade you have to rest off.
  hero.hp = Math.min(derived().maxHp, hero.hp + Math.max(0, derived().maxHp - before));
  persist();
}

/* ------------------------------------------------------------------ nodes -- */

function enterNode() {
  const type = nodeType();
  if (type === "rest") {
    const d = derived();
    const healed = Math.min(Math.round(d.maxHp * 0.5), d.maxHp - hero.hp);
    hero.hp += healed;
    reward = { xp: 0, levels: 0, item: null, rested: healed };
    scene = "reward";
    advanceNode();
    return;
  }
  if (type === "cache") {
    reward = { xp: 0, levels: 0, item: rollLoot("cache"), cache: true };
    scene = "reward";
    advanceNode();
    return;
  }
  startBattle();
}

/* ---------------------------------------------------------------- drawing -- */

function text(str, x, y, opts = {}) {
  const { size = 15, weight = 400, color = FG, align = "center", baseline = "middle" } = opts;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function panel(rect, { fill = CARD, stroke = "rgba(255,255,255,0.07)", radius = 14 } = {}) {
  roundRect(rect.x, rect.y, rect.w, rect.h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

/** Nothing tappable is ever shorter than a thumb; disabled buttons don't register. */
function button(rect, label, { sub, tone = "accent", disabled = false, action } = {}) {
  const { x, y, w, h } = rect;
  roundRect(x, y, w, h, 14);
  ctx.fillStyle = disabled ? "#222939" : tone === "accent" ? ACCENT : RAISED;
  ctx.fill();
  if (tone !== "accent") {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.stroke();
  }
  const fg = disabled ? "#59617a" : tone === "accent" ? "#06210f" : FG;
  text(label, x + w / 2, y + h / 2 + (sub ? -9 : 0), { size: 17, weight: 600, color: fg });
  if (sub) {
    text(sub, x + w / 2, y + h / 2 + 13, {
      size: 12,
      color: disabled ? "#4c5468" : tone === "accent" ? "rgba(6,33,15,0.72)" : DIM,
    });
  }
  if (!disabled && action) hits.push({ x, y, w, h, action });
}

function drawBackground(L) {
  ctx.fillStyle = "#0c0f16";
  ctx.fillRect(0, 0, L.W, L.H);
  // A slow grid: enough to read as "inside a machine", cheap enough to ignore.
  ctx.strokeStyle = "rgba(96,165,250,0.05)";
  ctx.lineWidth = 1;
  const step = 34;
  const drift = (elapsed * 8) % step;
  for (let x = -step + drift; x < L.W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, L.H);
    ctx.stroke();
  }
  for (let y = -step + drift; y < L.H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(L.W, y);
    ctx.stroke();
  }
}

function drawWizard(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y + Math.sin(elapsed * 1.6) * 1.5);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#3b4a7a";
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(15, 22);
  ctx.lineTo(-15, 22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#e7c9a9";
  ctx.beginPath();
  ctx.arc(0, -16, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d8dfec";
  ctx.beginPath();
  ctx.moveTo(-5.5, -12);
  ctx.lineTo(5.5, -12);
  ctx.lineTo(0, 1);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#4f5f96";
  ctx.beginPath();
  ctx.moveTo(0, -40);
  ctx.lineTo(12, -20);
  ctx.lineTo(-12, -20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2c3760";
  ctx.fillRect(-13, -22, 26, 4);

  ctx.strokeStyle = "#8a6b4a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(14, 20);
  ctx.lineTo(18, -24);
  ctx.stroke();
  const glow = 5 + Math.sin(elapsed * 3) * 1.2;
  ctx.fillStyle = "rgba(96,165,250,0.2)";
  ctx.beginPath();
  ctx.arc(18, -26, glow * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ACCENT2;
  ctx.beginPath();
  ctx.arc(18, -26, glow, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawThreatSprite(enemy, x, y, scale) {
  const hue = {
    virus: 135,
    worm: 48,
    phish: 198,
    trojan: 27,
    botnet: 282,
    drone: 282,
    ransom: 0,
    zeroday: 320,
  }[enemy.kind];
  const body = enemy.flash > 0 ? "#ffffff" : `hsl(${hue} 68% 56%)`;
  const trim = enemy.flash > 0 ? "#ffffff" : `hsl(${hue} 85% 74%)`;
  const t = elapsed + enemy.wobble;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  if (enemy.kind === "virus") {
    ctx.strokeStyle = trim;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8);
      ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
      ctx.stroke();
    }
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.kind === "worm") {
    ctx.fillStyle = body;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(Math.sin(t * 2 - i * 0.8) * 6, 10 - i * 7, 8 - i * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (enemy.kind === "phish") {
    ctx.rotate(Math.sin(t * 1.4) * 0.16);
    ctx.fillStyle = body;
    roundRect(-15, -11, 30, 22, 4);
    ctx.fill();
    ctx.strokeStyle = "#0c0f16";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-15, -11);
    ctx.lineTo(0, 2);
    ctx.lineTo(15, -11);
    ctx.stroke();
    ctx.strokeStyle = trim;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 17, 6, Math.PI * 0.15, Math.PI * 0.95);
    ctx.stroke();
  } else if (enemy.kind === "trojan") {
    ctx.fillStyle = body;
    roundRect(-19, -14, 38, 28, 4);
    ctx.fill();
    ctx.fillStyle = trim;
    ctx.fillRect(-19, -4, 38, 4);
    ctx.fillRect(-3, -14, 6, 28);
    ctx.fillStyle = `rgba(255,240,180,${0.35 + 0.35 * Math.sin(t * 3)})`;
    ctx.fillRect(-17, -2, 34, 2);
  } else if (enemy.kind === "botnet" || enemy.kind === "drone") {
    const r = enemy.kind === "drone" ? 10 : 16;
    ctx.fillStyle = body;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = trim;
    for (let i = 0; i < 3; i++) {
      const a = t * 1.2 + (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * (r + 6), Math.sin(a) * (r + 6), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (enemy.kind === "ransom") {
    ctx.strokeStyle = trim;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -8, 9, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = body;
    roundRect(-14, -8, 28, 22, 4);
    ctx.fill();
    ctx.fillStyle = "#0c0f16";
    ctx.beginPath();
    ctx.arc(0, 1, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-1.4, 1, 2.8, 7);
  } else {
    if (Math.sin(t * 9) > 0.85) ctx.translate(rand(-3, 3), 0);
    ctx.fillStyle = body;
    roundRect(-30, -26, 60, 46, 12);
    ctx.fill();
    ctx.fillStyle = "#0c0f16";
    roundRect(-20, -16, 15, 13, 4);
    ctx.fill();
    roundRect(5, -16, 15, 13, 4);
    ctx.fill();
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.arc(-12.5, -9.5, 3.6, 0, Math.PI * 2);
    ctx.arc(12.5, -9.5, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0c0f16";
    for (let i = -2; i <= 2; i++) ctx.fillRect(i * 8 - 2, 5, 4, 11);
  }
  ctx.restore();
}

function drawEffects() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.life * 1.6, 0, 1);
    text(f.text, f.x, f.y, { size: f.size, weight: 700, color: f.color });
  }
  ctx.globalAlpha = 1;
}

/* --------------------------------------------------------------- battle UI -- */

function drawIntent(enemy, x, y) {
  const intent = enemy.intent;
  if (!intent) return;
  const label = intent.type === "attack" ? String(intent.shown) : intent.label || "";
  const icon = INTENT_ICON[intent.type] || "❔";
  const w = 30 + label.length * 8;
  const heavy = intent.heavy;

  roundRect(x - w / 2, y - 13, w, 26, 13);
  ctx.fillStyle = heavy ? "rgba(248,113,113,0.22)" : "rgba(0,0,0,0.45)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = heavy ? DANGER : "rgba(255,255,255,0.12)";
  ctx.stroke();
  text(icon, x - w / 2 + 14, y, { size: 14 });
  if (label) {
    text(label, x - w / 2 + 26, y + 1, {
      size: 13,
      weight: 700,
      align: "left",
      color: intent.type === "attack" ? (heavy ? DANGER : FG) : DIM,
    });
  }
}

function drawEnemies(L) {
  const n = battle.enemies.length;
  battle.enemies.forEach((enemy, i) => {
    const at = enemyAnchor(enemy);
    const w = at.w;
    const cardH = clamp(L.field.h - 60, 100, 150);
    // Centred in whatever space is left rather than pinned to the top, so a
    // tall phone doesn't leave a dead band above the hero.
    const cardTop = L.field.y + Math.max(34, (L.field.h - cardH) / 2);
    const selected = i === battle.target;

    panel(
      { x: at.x - w / 2, y: cardTop, w, h: cardH },
      {
        fill: selected ? "#232c40" : "rgba(28,35,49,0.6)",
        stroke: selected ? ACCENT2 : "rgba(255,255,255,0.06)",
        radius: 16,
      },
    );

    drawThreatSprite(
      enemy,
      at.x,
      cardTop + cardH * 0.34,
      (n > 2 ? 0.85 : 1) * Math.min(1, cardH / 150),
    );
    drawIntent(enemy, at.x, cardTop + 14);

    text(enemy.name, at.x, cardTop + cardH - 44, { size: n > 2 ? 11 : 12, weight: 600 });

    const bw = w - 20;
    const bx = at.x - bw / 2;
    const by = cardTop + cardH - 30;
    roundRect(bx, by, bw, 8, 4);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fill();
    roundRect(bx, by, Math.max(3, bw * clamp(enemy.hp / enemy.maxHp, 0, 1)), 8, 4);
    ctx.fillStyle = enemy.boss ? "#f472b6" : DANGER;
    ctx.fill();
    text(`${enemy.hp}/${enemy.maxHp}`, at.x, by + 18, { size: 10, color: DIM });

    // Weakness is the whole tactical read, so it sits on the card, not in a menu.
    const tags = [];
    if (enemy.weak) tags.push({ txt: `${SCHOOLS[enemy.weak].icon}↓`, color: GOLD });
    if (enemy.resist) tags.push({ txt: `${SCHOOLS[enemy.resist].icon}↑`, color: DIM });
    if (enemy.armor) tags.push({ txt: `🛡️${enemy.armor}`, color: DIM });
    tags.forEach((tag, k) => {
      text(tag.txt, at.x - ((tags.length - 1) * 26) / 2 + k * 26, cardTop + cardH - 62, {
        size: 12,
        color: tag.color,
      });
    });

    if (enemy.shield > 0) {
      text(`🛡️ ${enemy.shield}`, at.x, cardTop + 74, { size: 12, color: ACCENT2 });
    }

    hits.push({
      x: at.x - w / 2,
      y: cardTop,
      w,
      h: cardH,
      action: () => {
        battle.target = i;
        vibrate(6);
      },
    });
  });
}

function drawHeroStrip(L) {
  const d = derived();
  const r = L.strip;
  panel(r, { fill: "rgba(25,30,41,0.92)" });

  drawWizard(r.x + 30, r.y + r.h - 12, 0.62);

  const barX = r.x + 58;
  const barW = r.w - 70;
  roundRect(barX, r.y + 12, barW, 12, 6);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fill();
  const frac = clamp(hero.hp / d.maxHp, 0, 1);
  roundRect(barX, r.y + 12, Math.max(4, barW * frac), 12, 6);
  ctx.fillStyle = frac > 0.5 ? ACCENT : frac > 0.25 ? GOLD : DANGER;
  ctx.fill();
  text(`${Math.ceil(hero.hp)}/${d.maxHp}`, barX + 6, r.y + 18, {
    size: 10,
    color: "#06210f",
    align: "left",
    weight: 700,
  });

  if (hero.block > 0) {
    text(`🛡️ ${hero.block}`, barX + barW, r.y + 18, {
      size: 13,
      weight: 700,
      align: "right",
      color: ACCENT2,
    });
  }

  // Mana as pips: countable at a glance, which is what you do every turn.
  for (let i = 0; i < d.maxMana; i++) {
    const x = barX + 7 + i * 18;
    const y = r.y + 40;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = i < hero.mana ? ACCENT2 : "rgba(255,255,255,0.12)";
    ctx.fill();
  }
  text(`Turn ${battle.turn}`, r.x + r.w - 8, r.y + 40, { size: 12, color: DIM, align: "right" });
}

function drawSpellGrid(L) {
  const d = derived();
  const g = L.grid;
  const cw = (g.w - 8) / 2;
  const ch = g.rowH;

  SPELLS.forEach((spell, i) => {
    const x = g.x + (i % 2) * (cw + 8);
    const y = g.y + Math.floor(i / 2) * (ch + 8);
    const locked = !learned(spell);
    const encrypted = !!hero.encrypted[spell.id];
    const poor = hero.mana < spell.cost;
    const usable = !locked && !encrypted && !poor && battle.phase === "player";

    panel(
      { x, y, w: cw, h: ch },
      {
        fill: usable ? "#20293c" : "#161c28",
        stroke: usable ? "rgba(96,165,250,0.45)" : "rgba(255,255,255,0.05)",
      },
    );

    ctx.globalAlpha = locked || encrypted ? 0.45 : 1;
    text(encrypted ? "🔒" : spell.icon, x + 22, y + ch / 2 - 6, { size: 20 });
    text(spell.name, x + 40, y + 16, {
      size: 13,
      weight: 600,
      align: "left",
      color: usable ? FG : DIM,
    });
    // Locked spells keep their name and advertise the level that buys them —
    // seeing what's three levels out is half the reason to climb.
    text(
      locked
        ? `unlocks at level ${spell.level}`
        : encrypted
          ? `encrypted · ${hero.encrypted[spell.id]} turn${hero.encrypted[spell.id] > 1 ? "s" : ""}`
          : spell.blurb(d),
      x + 40,
      y + 34,
      { size: 11, align: "left", color: encrypted ? "#c084fc" : DIM },
    );
    if (spell.school) {
      text(SCHOOLS[spell.school].icon, x + cw - 14, y + ch - 14, { size: 11 });
    }
    ctx.globalAlpha = 1;

    // Cost pips, top-right: the number you check before every tap.
    if (!locked) {
      for (let c = 0; c < spell.cost; c++) {
        ctx.beginPath();
        ctx.arc(x + cw - 12 - c * 11, y + 13, 4, 0, Math.PI * 2);
        ctx.fillStyle = poor ? "rgba(255,255,255,0.18)" : ACCENT2;
        ctx.fill();
      }
    }

    if (usable) hits.push({ x, y, w: cw, h: ch, action: () => castSpell(spell) });
  });
}

function drawBattle(L) {
  ctx.save();
  if (shake > 0.4) ctx.translate(rand(-shake, shake) * 0.4, rand(-shake, shake) * 0.4);
  drawEnemies(L);
  ctx.restore();

  drawHeroStrip(L);
  drawSpellGrid(L);

  const waiting = battle.phase !== "player";
  button(L.endTurn, waiting ? "…" : "End Turn", {
    tone: "raised",
    disabled: waiting,
    action: endTurn,
  });

  drawEffects();

  if (banner) {
    ctx.fillStyle = `rgba(12,15,22,${0.6 * clamp(banner.life, 0, 1)})`;
    ctx.fillRect(0, 0, L.W, L.H);
    text(banner.text, L.W / 2, L.H * 0.36, {
      size: 30,
      weight: 700,
      color: battle.type === "boss" ? DANGER : FG,
    });
    text(`${sectorName()} · node ${save.node + 1}`, L.W / 2, L.H * 0.36 + 30, {
      size: 14,
      color: DIM,
    });
  }
}

/* ----------------------------------------------------------------- menus -- */

function menuFrame(L, title, subtitle, color = FG) {
  ctx.fillStyle = "rgba(12,15,22,0.9)";
  ctx.fillRect(0, 0, L.W, L.H);
  text(title, L.W / 2, 66, { size: 28, weight: 700, color });
  if (subtitle) text(subtitle, L.W / 2, 96, { size: 14, color: DIM });
}

function drawXpBar(L, y) {
  const w = L.W - 48;
  const x = 24;
  roundRect(x, y, w, 6, 3);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fill();
  roundRect(x, y, Math.max(3, w * clamp(save.xp / xpNeed(save.level), 0, 1)), 6, 3);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  text(`Level ${save.level}`, x, y - 12, { size: 12, color: DIM, align: "left" });
  text(`${save.xp}/${xpNeed(save.level)} XP`, x + w, y - 12, {
    size: 12,
    color: DIM,
    align: "right",
  });
}

function drawHome(L) {
  drawWizard(L.W / 2, L.H * 0.44, 1.9);
  ctx.fillStyle = "rgba(12,15,22,0.3)";
  ctx.fillRect(0, 0, L.W, L.H);

  text("FIREWALL", L.W / 2, L.H * 0.15, { size: 34, weight: 700 });
  text("MAGE", L.W / 2, L.H * 0.15 + 36, { size: 34, weight: 700, color: ACCENT2 });

  const fresh = save.sector === 1 && save.node === 0 && save.level === 1;
  text(
    fresh ? "A turn-based defence of the network." : `${sectorName()} · Level ${save.level}`,
    L.W / 2,
    L.H * 0.62,
    { size: 16, color: fresh ? DIM : FG, weight: fresh ? 400 : 600 },
  );
  if (!fresh) {
    text(
      `Node ${save.node + 1}/${NODE_PLAN.length} · Integrity ${Math.ceil(hero.hp)}/${derived().maxHp}`,
      L.W / 2,
      L.H * 0.62 + 22,
      { size: 13, color: DIM },
    );
  }

  const bw = Math.min(300, L.W - 48);
  const bx = (L.W - bw) / 2;
  button({ x: bx, y: L.H * 0.71, w: bw, h: 60 }, fresh ? "Begin" : "Continue", {
    sub: fresh
      ? "Read the intent, pick your school"
      : `Sector ${save.sector}, node ${save.node + 1}`,
    action: () => {
      confirmReset = false;
      scene = "map";
    },
  });

  if (confirmReset) {
    button({ x: bx, y: L.H * 0.71 + 72, w: bw, h: 52 }, "Erase everything", {
      tone: "raised",
      action: () => {
        store.clear("save");
        save = load();
        hero.hp = derived().maxHp;
        confirmReset = false;
        syncHud();
      },
    });
    button({ x: bx, y: L.H * 0.71 + 132, w: bw, h: 46 }, "Keep my progress", {
      tone: "raised",
      action: () => (confirmReset = false),
    });
  } else if (!fresh) {
    button({ x: bx, y: L.H * 0.71 + 72, w: bw, h: 48 }, "Reset progress", {
      tone: "raised",
      action: () => (confirmReset = true),
    });
  }
}

function drawMap(L) {
  menuFrame(L, `Sector ${save.sector}`, sectorName(), ACCENT2);
  drawXpBar(L, 128);

  const d = derived();
  text(
    `Integrity ${Math.ceil(hero.hp)}/${d.maxHp}   Power ${d.power}   Ward ${d.ward}   Focus ${d.focus}`,
    L.W / 2,
    154,
    { size: 12, color: DIM },
  );

  const top = 174;
  const bottom = L.H - 146;
  // No lower clamp: the list has to fit whatever is left, or the last node
  // ends up underneath the Enter button on a short phone.
  const rowH = Math.min(58, (bottom - top) / NODE_PLAN.length);

  NODE_PLAN.forEach((type, i) => {
    const info = NODE_INFO[type];
    const y = top + i * rowH;
    const done = i < save.node;
    const current = i === save.node;
    const h = rowH - 6;

    panel(
      { x: 24, y, w: L.W - 48, h },
      {
        fill: current ? "#232c40" : "rgba(25,30,41,0.7)",
        stroke: current ? ACCENT : "rgba(255,255,255,0.05)",
      },
    );
    ctx.globalAlpha = done ? 0.4 : current ? 1 : 0.62;
    text(info.icon, 48, y + h / 2, { size: 19 });
    text(info.name, 72, y + h / 2, { size: 15, weight: current ? 700 : 500, align: "left" });
    text(done ? "cleared" : current ? "you are here" : "", L.W - 40, y + h / 2, {
      size: 12,
      color: done ? ACCENT : GOLD,
      align: "right",
    });
    ctx.globalAlpha = 1;
  });

  const bw = L.W - 48;
  const type = nodeType();
  button({ x: 24, y: L.H - 138, w: bw, h: 58 }, `Enter ${NODE_INFO[type].name}`, {
    sub: type === "rest" ? "Repair 50% integrity" : type === "cache" ? "Free loot" : "Fight",
    action: enterNode,
  });
  button({ x: 24, y: L.H - 72, w: (bw - 10) / 2, h: 50 }, "Character", {
    tone: "raised",
    sub: save.points ? `${save.points} point${save.points > 1 ? "s" : ""}` : undefined,
    action: () => (scene = "character"),
  });
  button({ x: 24 + (bw - 10) / 2 + 10, y: L.H - 72, w: (bw - 10) / 2, h: 50 }, "Camp", {
    tone: "raised",
    action: () => (scene = "home"),
  });
}

function drawCharacter(L) {
  menuFrame(L, "Character", `Level ${save.level} · ${sectorName()}`, GOLD);
  drawXpBar(L, 128);

  const d = derived();
  // Both lists are measured against what's left above the Back button rather
  // than laid out from constants, or the last gear row hides under it.
  const top = 158;
  const space = L.H - 84 - top;
  const statH = clamp(space * 0.15, 42, 54);
  const gearH = clamp(space * 0.13, 38, 54);
  const gearTop = top + 3 * (statH + 8) + 28;

  const rows = [
    ["power", "Power", d.power, "spell damage"],
    ["ward", "Ward", d.ward, "block and integrity"],
    ["focus", "Focus", d.focus, "mana and healing"],
  ];
  rows.forEach(([id, label, value, note], i) => {
    const y = top + i * (statH + 8);
    const r = { x: 24, y, w: L.W - 48, h: statH };
    panel(r);
    text(label, 40, y + statH / 2 - 9, { size: 16, weight: 600, align: "left" });
    text(note, 40, y + statH / 2 + 10, { size: 11, color: DIM, align: "left" });
    text(String(value), L.W - (save.points ? 92 : 40), y + statH / 2, {
      size: 20,
      weight: 700,
      align: "right",
    });
    if (save.points > 0) {
      const plus = { x: L.W - 78, y: y + (statH - 40) / 2, w: 40, h: 40 };
      roundRect(plus.x, plus.y, plus.w, plus.h, 12);
      ctx.fillStyle = ACCENT;
      ctx.fill();
      text("+", plus.x + plus.w / 2, plus.y + plus.h / 2, {
        size: 22,
        weight: 700,
        color: "#06210f",
      });
      // Padded to a thumb: the drawn square is 40px, the tap target isn't.
      hits.push({
        x: plus.x - 8,
        y: plus.y - 8,
        w: plus.w + 16,
        h: plus.h + 16,
        action: () => {
          const before = derived().maxHp;
          save.stats[id]++;
          save.points--;
          hero.hp += Math.max(0, derived().maxHp - before);
          persist();
        },
      });
    }
  });

  text(
    save.points ? `${save.points} point${save.points > 1 ? "s" : ""} to spend` : "Gear",
    L.W / 2,
    gearTop - 16,
    { size: 14, color: save.points ? GOLD : DIM, weight: save.points ? 700 : 400 },
  );

  Object.entries(SLOTS).forEach(([slotId, slot], i) => {
    const y = gearTop + i * (gearH + 8);
    const item = save.gear[slotId];
    panel({ x: 24, y, w: L.W - 48, h: gearH });
    text(slot.icon, 46, y + gearH / 2, { size: 19 });
    text(item ? item.name : `No ${slot.label}`, 72, y + gearH / 2 - 9, {
      size: 14,
      weight: 600,
      align: "left",
      color: item ? rarityOf(item).color : DIM,
    });
    text(item ? itemLines(item).join("  ") : "empty slot", 72, y + gearH / 2 + 9, {
      size: 11,
      color: DIM,
      align: "left",
    });
  });

  button({ x: 24, y: L.H - 70, w: L.W - 48, h: 58 }, "Back to map", {
    tone: "raised",
    action: () => (scene = "map"),
  });
}

function drawItemCard(rect, item, title) {
  panel(rect, { stroke: item ? rarityOf(item).color : "rgba(255,255,255,0.07)" });
  text(title, rect.x + 16, rect.y + 18, { size: 11, color: DIM, align: "left" });
  if (!item) {
    text("— empty —", rect.x + rect.w / 2, rect.y + rect.h / 2 + 6, { size: 14, color: DIM });
    return;
  }
  text(SLOTS[item.slot].icon, rect.x + 26, rect.y + 46, { size: 20 });
  text(item.name, rect.x + 50, rect.y + 40, {
    size: 16,
    weight: 700,
    align: "left",
    color: rarityOf(item).color,
  });
  text(`${rarityOf(item).name} ${SLOTS[item.slot].label}`, rect.x + 50, rect.y + 58, {
    size: 11,
    color: DIM,
    align: "left",
  });
  itemLines(item).forEach((line, i) => {
    text(line, rect.x + 16, rect.y + 84 + i * 18, { size: 13, color: ACCENT, align: "left" });
  });
}

function drawReward(L) {
  const item = reward.item;
  const rested = reward.rested;
  menuFrame(
    L,
    rested !== undefined ? "Safe node" : reward.cache ? "Data cache" : "Threat cleared",
    rested !== undefined
      ? "You patch yourself up."
      : reward.cache
        ? "Something useful in here."
        : sectorName(),
    ACCENT,
  );

  let y = 140;
  if (rested !== undefined) {
    text(`+${rested} integrity`, L.W / 2, y, { size: 20, weight: 700, color: ACCENT });
    y += 40;
  }
  if (reward.xp) {
    text(`+${reward.xp} XP`, L.W / 2, y, { size: 20, weight: 700, color: ACCENT });
    y += 30;
    if (reward.levels) {
      text(
        reward.levels === 1
          ? "Level up — 1 skill point"
          : `${reward.levels} levels — ${reward.levels} points`,
        L.W / 2,
        y,
        { size: 15, weight: 700, color: GOLD },
      );
      y += 26;
    }
    drawXpBar(L, y + 8);
    y += 34;
  }

  const bw = L.W - 48;
  if (item) {
    const current = save.gear[item.slot];
    const cardH = clamp((L.H - y - 190) / 2, 96, 150);
    drawItemCard({ x: 24, y: y + 8, w: bw, h: cardH }, item, "DROPPED");
    drawItemCard({ x: 24, y: y + 18 + cardH, w: bw, h: cardH }, current, "EQUIPPED");

    button({ x: 24, y: L.H - 142, w: bw, h: 58 }, "Equip", {
      sub: current ? `replaces ${current.name}` : `fills the ${SLOTS[item.slot].label} slot`,
      action: () => {
        equip(item);
        reward.item = null;
      },
    });
    button({ x: 24, y: L.H - 76, w: bw, h: 52 }, "Leave it", {
      tone: "raised",
      action: () => {
        reward.item = null;
      },
    });
  } else {
    button({ x: 24, y: L.H - 90, w: bw, h: 60 }, "Back to map", {
      sub: `${sectorName()} · node ${save.node + 1}`,
      action: () => {
        persist();
        scene = "map";
      },
    });
  }
}

function drawDefeat(L) {
  menuFrame(L, "Core breached", `${sectorName()} · node ${save.node + 1}`, DANGER);
  text("You wake up at the last safe node.", L.W / 2, 150, { size: 15, color: DIM });
  text("Levels, stats and gear are yours to keep.", L.W / 2, 174, { size: 15, color: DIM });

  const bw = L.W - 48;
  button({ x: 24, y: L.H * 0.55, w: bw, h: 60 }, "Try the node again", {
    sub: "Integrity fully repaired",
    action: enterNode,
  });
  button(
    { x: 24, y: L.H * 0.55 + 72, w: bw, h: 52 },
    save.points ? "Spend skill points" : "Back to map",
    {
      tone: "raised",
      action: () => (scene = save.points ? "character" : "map"),
    },
  );
}

/* ------------------------------------------------------------------ input -- */

createInput(stage, {
  onTap({ x, y }) {
    // Panels are registered in draw order, so scanning backwards hits whatever
    // is visually on top.
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        h.action();
        return;
      }
    }
  },
});

/* ------------------------------------------------------------------- loop -- */

function updateEffects(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 200 * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);

  for (const f of floaters) {
    f.y -= 26 * dt;
    f.life -= dt;
  }
  floaters = floaters.filter((f) => f.life > 0);

  shake *= Math.pow(0.02, dt);
  if (banner) {
    banner.life -= dt;
    if (banner.life <= 0) banner = null;
  }
}

/** Enemy turns resolve one at a time on a timer, so you can read what hit you. */
function updateBattle(dt) {
  for (const e of battle.enemies) e.flash = Math.max(0, e.flash - dt);
  if (battle.phase !== "enemy") return;

  battle.timer -= dt;
  if (battle.timer > 0) return;

  const next = battle.queue.shift();
  if (next) {
    if (next.hp > 0 && battle.enemies.includes(next)) resolveIntent(next);
    battle.timer = 0.45;
    return;
  }
  if (battle.phase === "enemy") startPlayerTurn();
}

syncHud();

createLoop((dt, total) => {
  elapsed = total;
  const L = layout();

  updateEffects(dt);
  if (scene === "battle" && battle && !banner) updateBattle(dt);

  ctx.clearRect(0, 0, L.W, L.H);
  hits = [];
  drawBackground(L);

  if (scene === "battle") drawBattle(L);
  else if (scene === "home") drawHome(L);
  else if (scene === "map") drawMap(L);
  else if (scene === "character") drawCharacter(L);
  else if (scene === "reward") drawReward(L);
  else if (scene === "defeat") drawDefeat(L);

  if (scene !== "battle") drawEffects();
});
