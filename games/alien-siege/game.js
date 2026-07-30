/**
 * Alien Siege — a wave shooter for one thumb.
 *
 * The ship follows your finger *relatively*: dragging moves it by however far
 * you dragged rather than teleporting it under your thumb. That's the whole
 * reason this is playable one-handed — the thing you're aiming is never hidden
 * by the thing you're aiming with, and you can re-grip anywhere on the screen.
 * Firing is automatic for the same reason: a fire button would want a second
 * thumb, and holding one down is not a skill worth testing.
 *
 * Everything else is pressure management. Enemies that reach the bottom wrap
 * around to the top instead of despawning, so a wave only ends when you clear
 * it — running away buys time, never progress. Gun level is the risk dial:
 * power-ups raise it, taking a hit drops it, so a clean run snowballs upward
 * and a messy one snowballs down.
 */

import { createLoop, createInput, vibrate, clamp, rand, randInt } from "../../shared/engine.js";
import { createShell } from "../../shared/ui.js";
import { createStore } from "../../shared/storage.js";

const SHIP_R = 13; // collision radius — smaller than the sprite, deliberately
const SHIP_TOP = 0.42; // the ship can't fly above this fraction of the stage
const FIRE_INTERVAL = 0.2;
const RAPID_INTERVAL = 0.1;
const RAPID_SECONDS = 8;
const BULLET_SPEED = 640;
const INVULN_SECONDS = 2;
const START_LIVES = 3;
const MAX_GUN = 3;
const DROP_CHANCE = 0.13;
const WAVE_BREAK = 1.7;
const MAX_PARTICLES = 260;
const BOSS_EVERY = 5;

const KINDS = {
  grunt: { r: 15, hp: 1, points: 10, hue: 300 },
  weaver: { r: 14, hp: 2, points: 20, hue: 186 },
  diver: { r: 14, hp: 1, points: 25, hue: 30 },
  tank: { r: 23, hp: 6, points: 60, hue: 0 },
  boss: { r: 52, hp: 40, points: 500, hue: 275 },
};

const shell = createShell({ title: "Alien Siege", stats: ["Wave", "Score", "Best"] });
const { stage } = shell;
const store = createStore("alien-siege");

let ship;
let bullets = [];
let shots = []; // enemy fire
let enemies = [];
let drops = [];
let particles = [];
let stars = [];

let score = 0;
let wave = 0;
let lives = START_LIVES;
let gun = 1;
let rapid = 0;
let shield = false;
let breakTimer = 0; // counts down the lull between waves
let banner = null;
let shake = 0;
let playing = false;

const best = () => store.get("best", 0);
const near = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) <= r;

/**
 * Does point `p` touch enemy `e`, allowing `pad` of extra radius? Everything
 * is a circle except the boss, which is far wider than it is tall — a circle
 * around that would eat shots a long way above its head.
 */
function overlaps(p, e, pad = 0) {
  if (e.kind !== "boss") return near(p, e, e.r + pad);
  const dx = (p.x - e.x) / (52 + pad);
  const dy = (p.y - e.y) / (32 + pad);
  return dx * dx + dy * dy <= 1;
}

/* ---------------------------------------------------------------- setup -- */

function makeStars() {
  stars = [];
  const count = Math.round((stage.width * stage.height) / 5200);
  for (let i = 0; i < count; i++) {
    const layer = randInt(0, 2);
    stars.push({
      x: rand(0, stage.width),
      y: rand(0, stage.height),
      layer,
      size: 0.6 + layer * 0.5,
      speed: 14 + layer * 26,
    });
  }
}

function resetShip() {
  ship = {
    x: stage.width / 2,
    y: stage.height * 0.82,
    cooldown: 0,
    invuln: INVULN_SECONDS,
  };
}

function start() {
  bullets = [];
  shots = [];
  enemies = [];
  drops = [];
  particles = [];
  score = 0;
  wave = 0;
  lives = START_LIVES;
  gun = 1;
  rapid = 0;
  shield = false;
  shake = 0;
  banner = null;
  breakTimer = 0.9;
  resetShip();
  playing = true;
  shell.setStat("Score", 0);
  shell.setStat("Wave", 0);
  shell.overlay.hide();
}

function end() {
  playing = false;
  const isRecord = score > best();
  store.setBest("best", score);
  shell.setStat("Best", best());
  shell.overlay.show({
    heading: isRecord ? "New best!" : "Overrun",
    score,
    body: isRecord
      ? `Wave ${wave}. Nothing to beat but yourself now.`
      : `Wave ${wave} · Best so far: ${best()}`,
    button: "Play again",
    onButton: start,
  });
}

/* ---------------------------------------------------------------- waves -- */

function spawnEnemy(kind, x, y, extra = {}) {
  const hp = extra.hp ?? KINDS[kind].hp;
  enemies.push({
    kind,
    x,
    y,
    baseX: x,
    r: KINDS[kind].r,
    hp,
    maxHp: hp,
    t: rand(0, Math.PI * 2),
    flash: 0,
    shotTimer: rand(1.2, 3.4),
    state: "in",
    vx: 0,
    vy: 0,
    ...extra,
  });
}

/** Lay the formation types out in a grid that fits a phone's width. */
function formation(list) {
  const cols = 5;
  const gap = stage.width / (cols + 1);
  list.forEach((kind, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Offset alternate rows so columns don't shadow each other exactly.
    const jitter = row % 2 ? gap * 0.5 : 0;
    const x = clamp(gap * (col + 1) + jitter, 26, stage.width - 26);
    spawnEnemy(kind, x, -46 - row * 58);
  });
}

function spawnWave(n) {
  if (n % BOSS_EVERY === 0) {
    const hp = 34 + n * 9;
    spawnEnemy("boss", stage.width / 2, -70, { hp, maxHp: hp, phase: 0, phaseTimer: 2 });
    for (let i = 0; i < 3; i++) {
      spawnEnemy("grunt", rand(40, stage.width - 40), -50 - i * 50);
    }
    return;
  }

  const list = [];
  const push = (kind, count) => {
    for (let i = 0; i < count; i++) list.push(kind);
  };
  push("grunt", 4 + Math.min(8, Math.round(n * 1.1)));
  if (n >= 2) push("weaver", Math.min(6, Math.floor(n / 2) + 1));
  if (n >= 4) push("tank", Math.min(3, Math.floor(n / 4)));
  // Shuffle, or the grid arrives sorted into neat bands by type.
  for (let i = list.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [list[i], list[j]] = [list[j], list[i]];
  }
  formation(list);

  const divers = n >= 3 ? Math.min(5, Math.floor((n - 1) / 2)) : 0;
  for (let i = 0; i < divers; i++) {
    spawnEnemy("diver", rand(30, stage.width - 30), -60 - i * 90, {
      hold: rand(0.14, 0.34) * stage.height,
      charge: rand(0.5, 1.6),
    });
  }
}

function nextWave() {
  wave++;
  shell.setStat("Wave", wave);
  spawnWave(wave);
  banner = { text: wave % BOSS_EVERY === 0 ? `Wave ${wave} — Hive Mother` : `Wave ${wave}`, t: 0 };
}

/* -------------------------------------------------------------- effects -- */

function boom(x, y, hue, count = 14, power = 200) {
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(0.25, 1) * power;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: rand(0.25, 0.65),
      max: 0.65,
      size: rand(1.5, 3.5),
      hue,
    });
  }
}

/* --------------------------------------------------------------- firing -- */

function fire() {
  const y = ship.y - 16;
  const shot = (x, vx) => bullets.push({ x, y, vx, vy: -BULLET_SPEED });
  if (gun === 1) {
    shot(ship.x, 0);
  } else if (gun === 2) {
    shot(ship.x - 8, 0);
    shot(ship.x + 8, 0);
  } else {
    shot(ship.x - 9, 0);
    shot(ship.x + 9, 0);
    shot(ship.x - 13, -BULLET_SPEED * 0.34);
    shot(ship.x + 13, BULLET_SPEED * 0.34);
  }
}

function enemyShot(e, vx, vy, hue) {
  shots.push({ x: e.x, y: e.y + e.r * 0.5, vx, vy, hue });
}

/** Velocity of `speed` pointing from `e` at wherever the ship is right now. */
function aimed(e, speed) {
  const dx = ship.x - e.x;
  const dy = ship.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  return { vx: (dx / d) * speed, vy: (dy / d) * speed };
}

function enemyFire(e) {
  const hue = KINDS[e.kind].hue;
  const speed = 190 + wave * 6;
  if (e.kind === "tank") {
    for (const a of [-0.34, 0, 0.34]) {
      enemyShot(e, Math.sin(a) * speed, Math.cos(a) * speed, hue);
    }
    e.shotTimer = rand(1.9, 3.2);
  } else if (e.kind === "weaver") {
    const v = aimed(e, speed);
    enemyShot(e, v.vx, v.vy, hue);
    e.shotTimer = rand(1.7, 3.4);
  } else {
    enemyShot(e, 0, speed, hue);
    e.shotTimer = rand(2.2, 4.6) - Math.min(1.2, wave * 0.08);
  }
}

function bossFire(e) {
  const hue = KINDS.boss.hue;
  const speed = 180 + wave * 4;
  if (e.phase === 0) {
    // A fan of five, to force lateral movement.
    for (let i = -2; i <= 2; i++) {
      const a = i * 0.28;
      enemyShot(e, Math.sin(a) * speed, Math.cos(a) * speed, hue);
    }
  } else if (e.phase === 1) {
    const v = aimed(e, speed * 1.25);
    enemyShot(e, v.vx, v.vy, hue);
  } else if (enemies.length < 8) {
    // Capped, or a slow boss fight buries you in escorts it spawned faster
    // than you could clear them.
    spawnEnemy("grunt", clamp(e.x + rand(-60, 60), 30, stage.width - 30), e.y);
  }
}

/* ------------------------------------------------------------- the ship -- */

function loseLife() {
  lives--;
  gun = Math.max(1, gun - 1);
  rapid = 0;
  shake = 1;
  vibrate(60);
  boom(ship.x, ship.y, 150, 34, 320);
  // Clear whatever was already on top of you, so respawning isn't a death.
  shots = shots.filter((s) => Math.hypot(s.x - ship.x, s.y - ship.y) > 130);
  if (lives <= 0) {
    end();
    return;
  }
  resetShip();
}

function takeHit() {
  if (shield) {
    shield = false;
    ship.invuln = 1;
    shake = 0.5;
    vibrate(25);
    boom(ship.x, ship.y, 190, 16, 180);
    return;
  }
  loseLife();
}

function damage(e, amount) {
  e.hp -= amount;
  e.flash = 0.08;
  if (e.hp > 0) {
    boom(e.x, e.y, KINDS[e.kind].hue, 3, 90);
    return;
  }

  const def = KINDS[e.kind];
  score += def.points;
  shell.setStat("Score", score);
  boom(e.x, e.y, def.hue, e.kind === "boss" ? 60 : 16, e.kind === "boss" ? 420 : 220);
  vibrate(e.kind === "boss" ? 80 : 12);
  if (e.kind === "boss") shake = 1;

  if (e.kind !== "boss" && Math.random() < DROP_CHANCE) {
    // Gun upgrades twice as often as the rest: it's the one you plan around.
    const kinds = ["gun", "gun", "rapid", "shield"];
    drops.push({ x: e.x, y: e.y, kind: kinds[randInt(0, kinds.length - 1)], t: 0 });
  }
  enemies.splice(enemies.indexOf(e), 1);
}

function collect(d) {
  if (d.kind === "gun") gun = Math.min(MAX_GUN, gun + 1);
  else if (d.kind === "rapid") rapid = RAPID_SECONDS;
  else shield = true;
  score += 15;
  shell.setStat("Score", score);
  vibrate(18);
  boom(d.x, d.y, d.kind === "gun" ? 140 : d.kind === "rapid" ? 50 : 200, 10, 140);
}

/* -------------------------------------------------------------- updates -- */

function updateBoss(e, dt) {
  const { width, height } = stage;
  const restY = height * 0.17;
  if (e.y < restY) {
    e.y += 60 * dt;
  } else {
    e.y = restY + Math.sin(e.t * 0.8) * 12;
  }
  e.x = clamp(width / 2 + Math.sin(e.t * 0.55) * width * 0.32, e.r, width - e.r);

  if (e.y < restY - 4) return; // no shooting on the way in

  e.phaseTimer -= dt;
  if (e.phaseTimer <= 0) {
    bossFire(e);
    // A bleeding boss attacks faster and leans on the aimed shot.
    const hurt = 1 - e.hp / e.maxHp;
    e.phaseTimer = rand(0.75, 1.5) * (1 - hurt * 0.45);
    e.phase = e.phase === 1 && Math.random() < 0.5 ? 1 : randInt(0, 2);
  }
}

function updateEnemy(e, dt) {
  const { width, height } = stage;
  e.t += dt;
  e.flash = Math.max(0, e.flash - dt);

  if (e.kind === "boss") {
    updateBoss(e, dt);
  } else if (e.kind === "diver") {
    if (e.state === "in") {
      e.y += (90 + wave * 4) * dt;
      if (e.y >= e.hold) e.state = "aim";
    } else if (e.state === "aim") {
      e.x = e.baseX + Math.sin(e.t * 6) * 6; // twitchy tell before it commits
      e.charge -= dt;
      if (e.charge <= 0) {
        const v = aimed(e, 340 + wave * 8);
        e.vx = v.vx;
        e.vy = Math.max(140, v.vy);
        e.state = "dive";
      }
    } else {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.x < e.r || e.x > width - e.r) e.vx *= -1;
    }
  } else {
    const speed =
      e.kind === "weaver" ? 78 + wave * 4 : e.kind === "tank" ? 36 + wave * 2.5 : 56 + wave * 4;
    const amp =
      e.kind === "weaver" ? width * 0.17 : e.kind === "tank" ? width * 0.05 : width * 0.07;
    const rate = e.kind === "weaver" ? 1.9 : 1.2;
    e.y += speed * dt;
    // Slide the sine's centre towards the ship — barely, until the wave is
    // nearly dead, at which point stragglers come and find you. Without this a
    // last enemy can hug the far edge and orbit forever.
    const drift = enemies.length <= 3 ? 55 : 12;
    e.baseX += clamp(ship.x - e.baseX, -drift * dt, drift * dt);
    e.x = clamp(e.baseX + Math.sin(e.t * rate) * amp, e.r, width - e.r);
  }

  // Leakers come back around from the top rather than vanishing: a wave is
  // over when it's dead, not when it's past you.
  if (e.kind !== "boss" && e.y > height + 60) {
    e.y = -60;
    e.baseX = rand(30, width - 30);
    e.x = e.baseX;
    if (e.kind === "diver") {
      e.state = "in";
      e.hold = rand(0.14, 0.34) * height;
      e.charge = rand(0.5, 1.4);
    }
  }

  // Divers attack by ramming, so they never shoot; the boss has its own cycle.
  if (e.kind !== "diver" && e.kind !== "boss" && e.y > 0 && e.y < height * 0.62) {
    e.shotTimer -= dt;
    if (e.shotTimer <= 0) enemyFire(e);
  }
}

function update(dt) {
  const { width, height } = stage;

  ship.invuln = Math.max(0, ship.invuln - dt);
  rapid = Math.max(0, rapid - dt);
  shake = Math.max(0, shake - dt * 2.2);
  if (banner) {
    banner.t += dt;
    if (banner.t > 2.2) banner = null;
  }

  ship.cooldown -= dt;
  if (ship.cooldown <= 0) {
    fire();
    ship.cooldown = rapid > 0 ? RAPID_INTERVAL : FIRE_INTERVAL;
  }

  for (const b of bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  bullets = bullets.filter((b) => b.y > -20 && b.x > -20 && b.x < width + 20);

  for (const s of shots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
  }
  shots = shots.filter((s) => s.y < height + 20 && s.y > -40 && s.x > -30 && s.x < width + 30);

  for (const d of drops) {
    d.t += dt;
    d.y += 95 * dt;
    d.x += Math.sin(d.t * 3) * 26 * dt;
  }
  drops = drops.filter((d) => d.y < height + 30);

  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - dt * 2.2;
    p.vy *= 1 - dt * 2.2;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);

  for (const s of stars) {
    s.y += s.speed * dt;
    if (s.y > height) {
      s.y = -2;
      s.x = rand(0, width);
    }
  }

  for (const e of enemies) updateEnemy(e, dt);

  // Backwards, so splicing a bullet mid-loop doesn't skip the next one.
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    for (const e of enemies) {
      if (overlaps(b, e)) {
        bullets.splice(i, 1);
        damage(e, 1);
        break;
      }
    }
  }

  // While invulnerable the ship is scenery: shots and hulls pass straight
  // through, so respawning next to the swarm isn't a free kill for either side.
  if (ship.invuln <= 0) {
    for (let i = shots.length - 1; i >= 0; i--) {
      if (near(shots[i], ship, SHIP_R + 5)) {
        shots.splice(i, 1);
        takeHit();
        return; // the ship moved — the rest of this frame's collisions are stale
      }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (overlaps(ship, e, SHIP_R)) {
        if (e.kind !== "boss") damage(e, e.hp);
        takeHit();
        return;
      }
    }
  }

  for (let i = drops.length - 1; i >= 0; i--) {
    // A generous pickup radius: chasing a drop shouldn't cost you a life.
    if (near(drops[i], ship, SHIP_R + 22)) {
      collect(drops[i]);
      drops.splice(i, 1);
    }
  }

  if (enemies.length === 0) {
    if (breakTimer <= 0) {
      score += wave * 25; // clear bonus, so waves are worth finishing fast
      shell.setStat("Score", score);
      breakTimer = WAVE_BREAK;
    } else {
      breakTimer -= dt;
      if (breakTimer <= 0) {
        nextWave();
        breakTimer = 0;
      }
    }
  }
}

/* -------------------------------------------------------------- drawing -- */

function drawShip(ctx) {
  // Blink through invulnerability, so it reads as "not solid yet".
  if (ship.invuln > 0 && Math.floor(ship.invuln * 10) % 2) return;

  ctx.save();
  ctx.translate(ship.x, ship.y);

  const flame = 12 + Math.random() * 8;
  ctx.beginPath();
  ctx.moveTo(-5, 8);
  ctx.lineTo(0, 8 + flame);
  ctx.lineTo(5, 8);
  ctx.fillStyle = `hsl(${28 + Math.random() * 20} 95% 62% / 0.85)`;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -19);
  ctx.lineTo(14, 11);
  ctx.lineTo(0, 5);
  ctx.lineTo(-14, 11);
  ctx.closePath();
  ctx.fillStyle = "#e8ecf4";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(6, 6);
  ctx.lineTo(-6, 6);
  ctx.closePath();
  ctx.fillStyle = "#60a5fa";
  ctx.fill();

  if (shield) {
    ctx.beginPath();
    ctx.arc(0, -2, SHIP_R + 12, 0, Math.PI * 2);
    ctx.strokeStyle = "hsl(200 90% 70% / 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawBoss(ctx, e, body, trim) {
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, 50, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-44, 6, 12, 16, 0.4, 0, Math.PI * 2);
  ctx.ellipse(44, 6, 12, 16, -0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = trim;
  ctx.beginPath();
  ctx.ellipse(0, -4, 20, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  const glare = 0.5 + 0.5 * Math.sin(e.t * 4);
  ctx.fillStyle = `hsl(${10 + glare * 40} 95% ${45 + glare * 20}%)`;
  ctx.beginPath();
  ctx.ellipse(0, -4, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = trim;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-18, 22);
  ctx.lineTo(-8, 34);
  ctx.moveTo(18, 22);
  ctx.lineTo(8, 34);
  ctx.stroke();
}

function drawEnemy(ctx, e) {
  const { hue } = KINDS[e.kind];
  const body = e.flash > 0 ? "#fff" : `hsl(${hue} 70% 58%)`;
  const trim = e.flash > 0 ? "#fff" : `hsl(${hue} 85% 74%)`;

  ctx.save();
  ctx.translate(e.x, e.y);

  if (e.kind === "grunt") {
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, 11, Math.PI, 0);
    ctx.lineTo(11, 5);
    ctx.lineTo(5, 5);
    ctx.lineTo(2, 10);
    ctx.lineTo(-2, 10);
    ctx.lineTo(-5, 5);
    ctx.lineTo(-11, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#0b0e15";
    ctx.fillRect(-6, -4, 4, 4);
    ctx.fillRect(2, -4, 4, 4);
  } else if (e.kind === "weaver") {
    ctx.rotate(Math.sin(e.t * 1.9) * 0.35);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(13, 0);
    ctx.lineTo(0, 14);
    ctx.lineTo(-13, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === "diver") {
    const charging = e.state === "aim";
    ctx.fillStyle = charging && Math.floor(e.t * 12) % 2 ? "#fff" : body;
    ctx.beginPath();
    ctx.moveTo(0, 15);
    ctx.lineTo(12, -10);
    ctx.lineTo(0, -4);
    ctx.lineTo(-12, -10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.arc(0, 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === "tank") {
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-22, -6);
    ctx.lineTo(-13, -14);
    ctx.lineTo(13, -14);
    ctx.lineTo(22, -6);
    ctx.lineTo(14, 12);
    ctx.lineTo(-14, 12);
    ctx.closePath();
    ctx.fill();
    // Damage reads as the hull bar being eaten away.
    ctx.fillStyle = trim;
    ctx.fillRect(-16, -3, 32, 4);
    ctx.fillStyle = "#0b0e15";
    ctx.fillRect(-16, -3, 32 * (1 - e.hp / e.maxHp), 4);
  } else {
    drawBoss(ctx, e, body, trim);
  }
  ctx.restore();
}

function drawBossBar(ctx, e) {
  const w = stage.width * 0.72;
  const x = (stage.width - w) / 2;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(x, 10, w, 6);
  ctx.fillStyle = `hsl(${KINDS.boss.hue} 80% 66%)`;
  ctx.fillRect(x, 10, w * clamp(e.hp / e.maxHp, 0, 1), 6);
}

/** Spare lives, bottom-left: out of the thumb's way, off the top corners. */
function drawLives(ctx) {
  for (let i = 0; i < lives - 1; i++) {
    const x = 16 + i * 16;
    const y = stage.height - 14;
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x + 5, y + 3);
    ctx.lineTo(x - 5, y + 3);
    ctx.closePath();
    ctx.fillStyle = "rgba(232,236,244,0.55)";
    ctx.fill();
  }

  // Rapid fire is the one power-up you can't see by looking at the ship, so it
  // gets a drain bar in the opposite corner.
  if (rapid > 0) {
    const w = 56;
    const x = stage.width - w - 14;
    const y = stage.height - 16;
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = "hsl(45 90% 62%)";
    ctx.fillRect(x, y, w * (rapid / RAPID_SECONDS), 4);
  }
}

function drawDrop(ctx, d) {
  const hue = d.kind === "gun" ? 140 : d.kind === "rapid" ? 45 : 200;
  const pulse = 1 + Math.sin(d.t * 8) * 0.08;
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.scale(pulse, pulse);
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fillStyle = `hsl(${hue} 75% 55% / 0.9)`;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = `hsl(${hue} 90% 78%)`;
  ctx.stroke();
  ctx.fillStyle = "#0b0e15";
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(d.kind === "gun" ? "▲" : d.kind === "rapid" ? "»" : "◉", 0, 1);
  ctx.restore();
}

function drawBanner(ctx) {
  const fade = banner.t < 1.5 ? 1 : 1 - (banner.t - 1.5) / 0.7;
  ctx.save();
  ctx.globalAlpha = clamp(fade, 0, 1);
  ctx.fillStyle = "#e8ecf4";
  ctx.font = "600 26px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(banner.text, stage.width / 2, stage.height * 0.4);
  ctx.restore();
}

function draw() {
  const { ctx, width, height } = stage;
  ctx.clearRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#161033");
  sky.addColorStop(0.55, "#10131a");
  sky.addColorStop(1, "#0a0c12");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  if (shake > 0) ctx.translate(rand(-1, 1) * shake * 7, rand(-1, 1) * shake * 7);

  for (const s of stars) {
    ctx.fillStyle = `rgba(232,236,244,${0.18 + s.layer * 0.22})`;
    ctx.fillRect(s.x, s.y, s.size, s.size * 2);
  }

  for (const d of drops) drawDrop(ctx, d);

  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = `hsl(${p.hue} 85% 65%)`;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  for (const e of enemies) drawEnemy(ctx, e);

  for (const b of bullets) {
    ctx.fillStyle = "rgba(74,222,128,0.28)";
    ctx.fillRect(b.x - 3.5, b.y - 11, 7, 16);
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(b.x - 1.5, b.y - 9, 3, 12);
  }

  // Halo, body, white-hot core: the core is what stops a shot from reading as
  // a small alien, since both are the shooter's colour.
  for (const s of shots) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${s.hue} 90% 68% / 0.25)`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${s.hue} 90% 68%)`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }

  if (playing) drawShip(ctx);
  ctx.restore();

  const boss = enemies.find((e) => e.kind === "boss");
  if (boss) drawBossBar(ctx, boss);
  if (playing) drawLives(ctx);
  if (banner) drawBanner(ctx);
}

/* --------------------------------------------------------------- wiring -- */

// Positions are pixels, so a rotation — or the iOS URL bar collapsing — has to
// rescale everything, or half the swarm ends up off-screen.
let lastW = stage.width;
let lastH = stage.height;
stage.onResize((w, h) => {
  if (w && h && lastW && lastH) {
    const kx = w / lastW;
    const ky = h / lastH;
    for (const o of [...enemies, ...bullets, ...shots, ...drops, ...particles, ship]) {
      if (!o) continue;
      o.x *= kx;
      o.y *= ky;
      if (o.baseX !== undefined) o.baseX *= kx;
      if (o.hold !== undefined) o.hold *= ky;
    }
  }
  lastW = w;
  lastH = h;
  makeStars();
});

createInput(stage, {
  onMove({ dx, dy }) {
    if (!playing) return;
    ship.x = clamp(ship.x + dx, SHIP_R, stage.width - SHIP_R);
    ship.y = clamp(ship.y + dy, stage.height * SHIP_TOP, stage.height - SHIP_R - 6);
  },
});

createLoop((dt) => {
  if (playing) update(dt);
  draw();
});

makeStars();
resetShip();
shell.setStat("Wave", 0);
shell.setStat("Best", best());
shell.overlay.show({
  heading: "Alien Siege",
  body: "Drag anywhere to fly — the ship moves with your thumb, not under it. The guns are automatic. Grab ▲ to upgrade them, » for rapid fire, ◉ for a shield. Three lives.",
  button: "Start",
  onButton: start,
});
