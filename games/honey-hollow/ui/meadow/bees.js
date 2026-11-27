// @ts-check
/**
 * The bees of the plot on show. Each one goes from her hive's door to one of
 * the beds in today's plan (chosen in proportion to what the plan takes from
 * that bed, so you can see where a hive forages), hovers there, and comes
 * home on a gently curved, wobbling path. A hive that tops up beyond the
 * hedge sends that share of its bees off past the edge of the picture.
 *
 * Everything is in squares (0..6 across and down), never pixels, and lives
 * in flat arrays: nothing is allocated while the bees fly.
 */

export const MAX_BEES = 48;

const INSIDE = 0;
const OUT = 1;
const AT = 2;
const BACK = 3;
const DOOR = 4;
const GONE = 5;

/**
 * @typedef {object} Home one hive on the plot
 * @property {number} x  its door, in squares
 * @property {number} y
 * @property {number} n  bees to show
 * @property {"fly" | "door" | "none"} mode
 * @property {{ x: number, y: number, w: number }[]} spots where they forage, weighted
 * @property {number} wild the weight of "beyond the hedge"
 */

export function createBees() {
  const home = new Int8Array(MAX_BEES);
  const rank = new Int8Array(MAX_BEES);
  const st = new Uint8Array(MAX_BEES);
  const far = new Uint8Array(MAX_BEES);
  const dir = new Int8Array(MAX_BEES);
  const f = () => new Float32Array(MAX_BEES);
  const x = f();
  const y = f();
  const rot = f();
  const alpha = f();
  const ph = f();
  const ax = f();
  const ay = f();
  const bx = f();
  const by = f();
  const cx = f();
  const cy = f();
  const nx = f();
  const ny = f();
  const t = f();
  const dur = f();
  const amp = f();
  const wf = f();
  const wait = f();
  /** @type {Home[]} */
  let homes = [];
  let n = 0;
  const rnd = Math.random;

  /** Choose where bee i goes next. */
  function aim(i) {
    const h = homes[home[i]];
    let total = h.wild;
    for (let k = 0; k < h.spots.length; k++) total += h.spots[k].w;
    let pick = rnd() * total;
    for (let k = 0; k < h.spots.length; k++) {
      const s = h.spots[k];
      pick -= s.w;
      if (pick <= 0) {
        bx[i] = s.x + (rnd() - 0.5) * 0.46;
        by[i] = s.y + (rnd() - 0.5) * 0.22;
        far[i] = 0;
        return;
      }
    }
    // Beyond the hedge: off past the nearer side, or over the top.
    const side = rnd();
    if (side < 0.34) {
      bx[i] = h.x < 3 ? -0.8 : 6.8;
      by[i] = h.y + (rnd() - 0.5) * 3;
    } else if (side < 0.67) {
      bx[i] = h.x < 3 ? 6.8 : -0.8;
      by[i] = h.y + (rnd() - 0.6) * 3;
    } else {
      bx[i] = h.x + (rnd() - 0.5) * 4;
      by[i] = -1;
    }
    far[i] = 1;
  }

  /** Send bee i from where she is to (x1, y1). */
  function launch(i, x1, y1, speed) {
    const x0 = x[i];
    const y0 = y[i];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy) || 0.001;
    const bow = (rnd() - 0.5) * 0.7 * d;
    ax[i] = x0;
    ay[i] = y0;
    bx[i] = x1;
    by[i] = y1;
    nx[i] = -dy / d;
    ny[i] = dx / d;
    cx[i] = (x0 + x1) / 2 + nx[i] * bow;
    cy[i] = (y0 + y1) / 2 + ny[i] * bow - 0.22 * Math.min(1, d);
    dur[i] = Math.max(0.55, d / (speed * (0.85 + rnd() * 0.4)));
    wf[i] = 5 + d * 3 + rnd() * 3;
    amp[i] = 0.05 + rnd() * 0.1;
    t[i] = 0;
  }

  function settle(i) {
    const h = homes[home[i]];
    if (h.mode === "door" && rank[i] < h.n) st[i] = DOOR;
    else {
      st[i] = GONE;
      alpha[i] = 0;
    }
  }

  /**
   * Give the bees their hives.
   * `scatter`: start them mid-flight (the day is already going).
   * `settle`: the day has just ended over the same hives; let those who are
   * out fly home instead of vanishing.
   * @param {Home[]} list
   * @param {{ scatter?: boolean, settle?: boolean }} [o]
   */
  function assign(list, o = {}) {
    if (o.settle && list.length === homes.length) {
      homes = list;
      for (let i = 0; i < n; i++) {
        const h = homes[home[i]];
        if (st[i] === OUT || st[i] === AT) {
          if (far[i] && st[i] === AT) {
            x[i] = bx[i];
            y[i] = by[i];
          }
          launch(i, h.x, h.y, 1.9);
          st[i] = BACK;
        } else if (st[i] === INSIDE || st[i] === DOOR) settle(i);
      }
      return;
    }
    homes = list;
    n = 0;
    for (let k = 0; k < homes.length; k++) {
      const h = homes[k];
      if (h.mode === "none") continue;
      for (let j = 0; j < h.n && n < MAX_BEES; j++) {
        const i = n++;
        home[i] = k;
        rank[i] = j;
        ph[i] = rnd() * 6.283;
        dir[i] = rnd() < 0.5 ? 1 : -1;
        rot[i] = 0;
        x[i] = h.x;
        y[i] = h.y;
        alpha[i] = 0;
        far[i] = 0;
        if (h.mode === "door") st[i] = DOOR;
        else if (o.scatter) {
          aim(i);
          launch(i, bx[i], by[i], 1.7);
          t[i] = rnd();
          st[i] = rnd() < 0.5 ? OUT : BACK;
          if (st[i] === BACK) {
            // The same curve, flown the other way.
            const sx = ax[i];
            const sy = ay[i];
            ax[i] = bx[i];
            ay[i] = by[i];
            bx[i] = sx;
            by[i] = sy;
          }
        } else {
          st[i] = INSIDE;
          wait[i] = rnd() * 2.6;
        }
      }
    }
  }

  /**
   * @param {number} dt seconds
   * @param {number} time seconds since the scene began
   * @param {number} pace 1, or more when the day runs fast
   */
  function step(dt, time, pace) {
    for (let i = 0; i < n; i++) {
      const h = homes[home[i]];
      const s = st[i];
      if (s === GONE) continue;
      if (s === INSIDE) {
        alpha[i] = 0;
        wait[i] -= dt * pace;
        if (wait[i] > 0) continue;
        if (h.mode !== "fly") {
          settle(i);
          continue;
        }
        x[i] = h.x;
        y[i] = h.y;
        aim(i);
        launch(i, bx[i], by[i], 1.7);
        st[i] = OUT;
      } else if (s === OUT || s === BACK) {
        t[i] += (dt * pace) / dur[i];
        const u = t[i] >= 1 ? 1 : t[i];
        const e = u * u * (3 - 2 * u);
        const v = 1 - e;
        const wob = Math.sin(u * Math.PI) * Math.sin(ph[i] + u * wf[i]) * amp[i];
        const px = v * v * ax[i] + 2 * v * e * cx[i] + e * e * bx[i] + nx[i] * wob;
        const py = v * v * ay[i] + 2 * v * e * cy[i] + e * e * by[i] + ny[i] * wob;
        const dx = px - x[i];
        const dy = py - y[i];
        if (dx > 0.003) dir[i] = 1;
        else if (dx < -0.003) dir[i] = -1;
        let tilt = dy / (Math.abs(dx) + 0.03);
        tilt = (tilt > 1 ? 1 : tilt < -1 ? -1 : tilt) * 0.4;
        rot[i] += (tilt - rot[i]) * 0.2;
        x[i] = px;
        y[i] = py;
        // In and out of the door she fades; past the hedge too.
        let a = s === OUT ? u * 7 : (1 - u) * 7;
        if (far[i]) {
          const b = s === OUT ? (1 - u) * 4 : u * 4;
          if (b < a) a = b;
        }
        alpha[i] = a > 1 ? 1 : a;
        if (u >= 1) {
          if (s === OUT) {
            st[i] = AT;
            wait[i] = far[i] ? 0.5 + rnd() * 1.2 : 1.1 + rnd() * 1.9;
          } else {
            st[i] = INSIDE;
            alpha[i] = 0;
            wait[i] = 0.25 + rnd() * 1.3;
          }
        }
      } else if (s === AT) {
        wait[i] -= dt * pace;
        if (!far[i]) {
          x[i] = bx[i] + Math.sin(time * 5.1 + ph[i]) * 0.05;
          y[i] = by[i] + Math.cos(time * 4.2 + ph[i] * 1.3) * 0.035;
          alpha[i] = 1;
        } else alpha[i] = 0;
        rot[i] *= 0.85;
        if (wait[i] <= 0) {
          launch(i, h.x, h.y, 1.7);
          st[i] = BACK;
        }
      } else if (s === DOOR) {
        const a = time * 1.5 + ph[i];
        const px = h.x + Math.cos(a) * 0.24;
        y[i] = h.y - 0.1 + Math.sin(a * 1.7 + ph[i]) * 0.1;
        dir[i] = px >= x[i] ? 1 : -1;
        x[i] = px;
        rot[i] = 0;
        alpha[i] += (1 - alpha[i]) * 0.1;
      }
    }
  }

  /** Reduced motion: no flying. Sit them on their flowers and at the door. */
  function pose() {
    for (let i = 0; i < n; i++) {
      const h = homes[home[i]];
      rot[i] = 0;
      if (h.mode === "fly" && rank[i] % 3 !== 2) {
        aim(i);
        if (!far[i]) {
          x[i] = bx[i];
          y[i] = by[i];
          alpha[i] = 1;
          st[i] = GONE;
          continue;
        }
      }
      const a = ph[i];
      x[i] = h.x + Math.cos(a) * 0.22;
      y[i] = h.y - 0.08 + Math.sin(a) * 0.08;
      alpha[i] = rank[i] < 4 ? 1 : 0;
      st[i] = GONE;
    }
  }

  return {
    x,
    y,
    rot,
    dir,
    alpha,
    get n() {
      return n;
    },
    /** Bees that can be seen right now. */
    count() {
      let c = 0;
      for (let i = 0; i < n; i++) if (alpha[i] > 0.05) c++;
      return c;
    },
    /** Bees on the wing between hive and flower right now. */
    flying() {
      let c = 0;
      for (let i = 0; i < n; i++) if ((st[i] === OUT || st[i] === BACK) && alpha[i] > 0.05) c++;
      return c;
    },
    assign,
    step,
    pose,
  };
}
