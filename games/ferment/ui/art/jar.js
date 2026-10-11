// @ts-check
/**
 * Jar art: one function from a jar's state to inline SVG.
 * Brine level = servings left; cloudiness, bubbles and lid doming = flavour;
 * a popped lid = gone over. The bits inside are placed by the jar's id, so a
 * jar looks the same every time it is drawn.
 */

import { RECIPES } from "../../content/recipes.js";
import { SERVINGS } from "../../content/tuning.js";
import { flavour, isOver } from "../../core/index.js";

/** A tiny xorshift generator for decoration only (never for rules). */
function seeded(n) {
  let x = (n * 2654435761) >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

export function jarSvg(jar, cls = "jar") {
  const r = RECIPES[jar.recipe];
  const over = isOver(jar);
  const q = Math.round(flavour(jar) * 40) / 40;
  const rnd = seeded(jar.id + 7);
  const level = Math.round(30 - 48 * (jar.servings / SERVINGS));
  const clip = `jc${jar.id}${cls}`;
  let bits = "";
  for (let i = 0; i < 7; i++) {
    const x = -22 + rnd() * 34;
    const y = level + 6 + rnd() * Math.max(2, 22 - level);
    const w = 10 + rnd() * 4;
    const h = 6 + rnd() * 3;
    const a = -28 + rnd() * 56;
    if (y < 30)
      bits += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${r.bits}" transform="rotate(${a.toFixed(0)} ${(x + w / 2).toFixed(1)} ${(y + h / 2).toFixed(1)})"/>`;
  }
  const nBub = over ? 12 : Math.round(q * 11);
  let bubs = "";
  for (let i = 0; i < 12; i++) {
    const x = -19 + rnd() * 38;
    const y = level + 4 + rnd() * Math.max(2, 30 - level);
    const rad = 1.6 + rnd() * 1.6;
    if (i < nBub)
      bubs += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}" fill="none" stroke="#fff" stroke-width="1.5"/>`;
  }
  const dome = 2 + q * 14;
  const lid = over
    ? `<g transform="rotate(-26 -20 -36)"><path d="M-24 -32 Q0 -48 24 -32 Z" fill="#a46f45"/><rect x="-24" y="-38" width="48" height="8" rx="2" fill="#8f6440"/></g>
       <g fill="#fff" stroke="#e2683f" stroke-width="1.5"><circle cx="-2" cy="-42" r="3"/><circle cx="7" cy="-50" r="2.5"/><circle cx="1" cy="-57" r="2"/></g>`
    : `<path d="M-24 -38 Q0 ${(-38 - dome).toFixed(1)} 24 -38 Z" fill="#a46f45"/><rect x="-24" y="-40" width="48" height="10" rx="2" fill="#8f6440"/>`;
  return `<svg class="${cls}" viewBox="-32 -62 64 100" preserveAspectRatio="xMidYMax meet">
    <rect x="-26" y="-30" width="52" height="66" rx="12" fill="#fbfbf7" stroke="#bfae96" stroke-width="2.5"/>
    <clipPath id="${clip}"><rect x="-24" y="-28" width="48" height="62" rx="10"/></clipPath>
    <g clip-path="url(#${clip})">
      <rect x="-26" y="${level}" width="52" height="${40 - level}" fill="${r.brine}" opacity=".6"/>
      ${bits}
      <rect x="-26" y="${level}" width="52" height="${40 - level}" fill="#fff" opacity="${(0.04 + q * 0.5).toFixed(2)}"/>
      ${bubs}
    </g>
    <rect x="-17" y="-26" width="6" height="56" rx="3" fill="#fff" opacity=".5"/>
    ${lid}
  </svg>`;
}

export const emptyJarSvg = `<svg class="jar" viewBox="-32 -62 64 100" preserveAspectRatio="xMidYMax meet">
  <rect x="-25" y="-38" width="50" height="74" rx="12" fill="none" stroke="#c9b08e" stroke-width="2" stroke-dasharray="5 4"/>
  <text x="0" y="8" text-anchor="middle" font-size="26" fill="#c9b08e">+</text></svg>`;
