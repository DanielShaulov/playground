// @ts-check
/**
 * The small lives of the meadow that are only there to be charming (two
 * butterflies, a ladybird, a snail, a winter bird) and the weather that
 * falls on it (rain, snow, the shadow of a cloud). None of them is ever in
 * the way of a tap: the screen hit-tests squares, not sprites.
 *
 * Creatures live in squares (0..6); the weather in shares of the ground
 * picture (0..1), so nothing here knows a pixel.
 */

const rnd = Math.random;
const RAIN = 84;
const SNOW = 64;

export function createLife() {
  const flies = [0, 1].map((i) => ({
    on: false,
    kind: i,
    x: 1 + i * 3,
    y: 2 + i,
    ax: 0,
    ay: 0,
    bx: 0,
    by: 0,
    cx: 0,
    cy: 0,
    t: 1,
    dur: 1,
    rest: 1 + i * 2,
    rot: 0,
    ph: rnd() * 6,
  }));
  const bug = { on: false, x: 2.2, y: 3.4, tx: 2.2, ty: 3.4, rest: 2, flip: false };
  const slug = { on: false, x: 0.6, y: 5.94, dir: 1 };
  const tit = { on: false, x: 2.5, y: 2.9, sing: 0, next: 3, hop: 0, hx: 0 };
  /** @type {{ x: number, y: number }[]} where butterflies like to settle */
  let spots = [];
  /** @type {(x: number, y: number) => boolean} */
  let dry = () => true;

  // Weather: fixed scatter, moved by the clock alone.
  const rx = new Float32Array(RAIN);
  const ry = new Float32Array(RAIN);
  const rs = new Float32Array(RAIN);
  for (let i = 0; i < RAIN; i++) {
    rx[i] = rnd();
    ry[i] = rnd();
    rs[i] = 1.25 + rnd() * 0.6;
  }
  const sx = new Float32Array(SNOW);
  const sy = new Float32Array(SNOW);
  const ss = new Float32Array(SNOW);
  for (let i = 0; i < SNOW; i++) {
    sx[i] = rnd();
    sy[i] = rnd();
    ss[i] = 0.07 + rnd() * 0.07;
  }

  let sky = "clear"; // "clear" | "cloud" | "rain" | "snow"
  let wind = 1;

  /**
   * @param {{ season: number, weather: string, owned: boolean,
   *   spots: { x: number, y: number }[], dry: (x: number, y: number) => boolean }} o
   */
  function set(o) {
    const fair = o.weather === "sunny" || o.weather === "cloudy";
    const green = o.season < 3 && o.owned;
    flies[0].on = green && fair && o.season < 2;
    flies[1].on = green && fair;
    bug.on = green && o.weather !== "rain";
    slug.on = green && (o.weather === "rain" || o.weather === "cloudy" || o.season === 0);
    tit.on = o.season === 3 && o.owned;
    spots = o.spots;
    dry = o.dry;
    sky =
      o.weather === "rain"
        ? "rain"
        : o.weather === "snow"
          ? "snow"
          : o.weather === "cloudy" || o.weather === "windy"
            ? "cloud"
            : "clear";
    wind = o.weather === "windy" ? 2.4 : 1;
    if (!dry(bug.x, bug.y)) {
      bug.x = bug.tx = 1.4;
      bug.y = bug.ty = 1.6;
    }
    if (!dry(tit.x, tit.y)) {
      tit.x = 1.5;
      tit.y = 1.9;
    }
    if (!dry(slug.x, slug.y)) slug.x = 0.6;
  }

  function somewhere(out) {
    if (spots.length && rnd() < 0.7) {
      const s = spots[(rnd() * spots.length) | 0];
      out.bx = s.x + (rnd() - 0.5) * 0.3;
      out.by = s.y - 0.05 + (rnd() - 0.5) * 0.2;
    } else {
      out.bx = 0.4 + rnd() * 5.2;
      out.by = 0.3 + rnd() * 5.2;
    }
  }

  /** @param {number} dt @param {number} time */
  function step(dt, time) {
    for (const b of flies) {
      if (!b.on) continue;
      if (b.t >= 1) {
        b.rest -= dt;
        if (b.rest > 0) continue;
        b.ax = b.x;
        b.ay = b.y;
        somewhere(b);
        const d = Math.hypot(b.bx - b.ax, b.by - b.ay) || 0.01;
        const bow = (rnd() - 0.5) * d;
        b.cx = (b.ax + b.bx) / 2 - ((b.by - b.ay) / d) * bow;
        b.cy = (b.ay + b.by) / 2 + ((b.bx - b.ax) / d) * bow - 0.3;
        b.dur = Math.max(1.2, d / 0.85);
        b.t = 0;
        b.rest = 2.5 + rnd() * 5;
      } else {
        b.t = Math.min(1, b.t + dt / b.dur);
        const e = b.t * b.t * (3 - 2 * b.t);
        const v = 1 - e;
        const flut = Math.sin(time * 7 + b.ph) * 0.07 * Math.sin(b.t * Math.PI);
        const px = v * v * b.ax + 2 * v * e * b.cx + e * e * b.bx + flut;
        const py =
          v * v * b.ay +
          2 * v * e * b.cy +
          e * e * b.by +
          Math.cos(time * 9 + b.ph) * 0.04 * Math.sin(b.t * Math.PI);
        const dx = px - b.x;
        const dy = py - b.y;
        if (dx * dx + dy * dy > 1e-7) {
          const want = Math.atan2(dy, dx) + Math.PI / 2;
          let turn = want - b.rot;
          while (turn > Math.PI) turn -= 2 * Math.PI;
          while (turn < -Math.PI) turn += 2 * Math.PI;
          b.rot += turn * 0.12;
        }
        b.x = px;
        b.y = py;
      }
    }
    if (bug.on) {
      const dx = bug.tx - bug.x;
      const dy = bug.ty - bug.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.02) {
        bug.rest -= dt;
        if (bug.rest <= 0) {
          for (let tries = 0; tries < 6; tries++) {
            const tx = Math.max(0.2, Math.min(5.8, bug.x + (rnd() - 0.5) * 2.4));
            const ty = Math.max(0.3, Math.min(5.8, bug.y + (rnd() - 0.5) * 1.6));
            if (!dry(tx, ty)) continue;
            bug.tx = tx;
            bug.ty = ty;
            break;
          }
          bug.rest = 2 + rnd() * 6;
        }
      } else {
        const s = Math.min(d, dt * 0.16);
        bug.x += (dx / d) * s;
        bug.y += (dy / d) * s;
        bug.flip = dx < 0;
      }
    }
    if (slug.on) {
      slug.x += slug.dir * dt * 0.018;
      if (slug.x > 5.5 || !dry(slug.x + 0.3, slug.y - 0.3)) slug.dir = -1;
      else if (slug.x < 0.4) slug.dir = 1;
    }
    if (tit.on) {
      tit.next -= dt;
      if (tit.sing > 0) tit.sing -= dt;
      if (tit.hop > 0) {
        tit.hop = Math.max(0, tit.hop - dt * 3);
        tit.x += tit.hx * dt * 3;
      }
      if (tit.next <= 0) {
        tit.next = 3 + rnd() * 5;
        if (rnd() < 0.5) tit.sing = 0.9;
        else {
          const hx = (rnd() < 0.5 ? -1 : 1) * 0.35;
          const nx = tit.x + hx;
          if (nx > 0.4 && nx < 5.6 && dry(nx, tit.y)) {
            tit.hx = hx;
            tit.hop = 1;
          }
        }
      }
    }
  }

  return {
    flies,
    bug,
    slug,
    tit,
    rain: { n: RAIN, x: rx, y: ry, s: rs },
    snow: { n: SNOW, x: sx, y: sy, s: ss },
    get sky() {
      return sky;
    },
    get wind() {
      return wind;
    },
    set,
    step,
  };
}
