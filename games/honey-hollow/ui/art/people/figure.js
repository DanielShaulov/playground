// Putting a person together. Everyone is the same stack of layers, back to
// front: veil, back hair, legs, clothes, hanging arms, neck, head, face,
// front hair, hat, then any arm that reaches forward and what it holds.

import { rng } from "../../paint/rng.js";
import { ellipse, wash } from "../../paint/wash.js";
import {
  geometry,
  paintLegs,
  paintTop,
  paintOver,
  paintShawl,
  paintNeck,
  paintNeckwear,
  paintArms,
} from "./body.js";
import { paintHead, paintFace, paintExtras } from "./head.js";
import { paintHair } from "./hair.js";
import { hatFit, hatBrim, paintHat, paintHatBack, brimShade } from "./hats.js";

/** A standing figure's sprite, in CSS px at design size. */
export const FIGURE_W = 100;
export const FIGURE_H = 136;
/** The ground line inside a figure sprite, and so its anchor. */
export const GROUND = 124;
/** How tall a grown-up stands in a figure sprite: scale by wanted / this. */
export const STANDING = 100;
export const BUST_W = 120;
export const BUST_H = 120;
const BUST_ZOOM = 1.5;

export const POSES = ["stand", "wave", "carry", "smoker", "bust"];
export const MOODS = ["calm", "happy", "oops"];

/**
 * Paint a resolved person `p` (see people.js for how looks and villagers
 * become one). Every part draws from its own seeded rng, named for what it
 * is, so changing the shirt does not reshuffle the hair.
 */
export function paintPerson(ctx, w, h, p, pose, mood) {
  const bust = pose === "bust";
  const g = geometry(p.body, p.shape);
  const seed = p.seed ?? "";
  const rs = (tag) => rng(`person/${seed}/${tag}`);
  const o = p.outfit;
  const hat = p.hat ?? { kind: "none" };
  const fit = hatFit(hat.kind);
  const tilt = (p.tilt ?? 0.03) + (pose === "wave" ? 0.05 : 0);

  ctx.save();
  if (bust) {
    ctx.scale(BUST_ZOOM, BUST_ZOOM);
    ctx.translate(
      w / BUST_ZOOM / 2,
      h / BUST_ZOOM / 2 + 3 + (p.body === "child" ? 5 : 0) - g.headY,
    );
  } else ctx.translate(w / 2, GROUND);

  const inHead = (paint) => {
    ctx.save();
    ctx.translate(0.4, g.headY);
    ctx.rotate(tilt);
    ctx.scale(g.head, g.head);
    paint();
    ctx.restore();
  };
  const hair = (layer) =>
    paintHair(layer, p.hair.style, {
      ctx,
      r: rs(`hair-${layer}-${p.hair.style}-${fit ? hat.kind : ""}`),
      c: p.hair.c,
      fit,
      hatted: !!fit,
      brim: hatBrim(hat.kind),
      ribbon: p.hair.ribbon,
    });

  inHead(() => {
    paintHatBack(ctx, rs(`hat-back-${hat.kind}`), hat);
    hair("back");
  });

  const rb = rs(`body-${p.body}-${p.shape ?? ""}-${pose}`);
  const untucked = (o.top.hem ?? 0) > 0;
  if (untucked) paintLegs(ctx, rb, g, o, p.skin, bust);
  paintTop(ctx, rb, g, o);
  if (!untucked) paintLegs(ctx, rb, g, o, p.skin, bust);
  paintOver(ctx, rb, g, o);
  paintArms(ctx, rb, g, o, p.skin, pose, "back");
  paintShawl(ctx, rb, g, o);
  paintNeck(ctx, rb, g, o, p.skin);
  paintNeckwear(ctx, rb, g, o);

  const face = {
    body: p.body,
    skin: p.skin,
    hair: p.hair.c,
    mood,
    beard: p.beard,
    glasses: p.glasses,
    ...p.face,
  };
  inHead(() => {
    const rf = rs(`face-${p.body}-${mood}`);
    paintHead(ctx, rf, face);
    paintFace(ctx, rf, face);
    brimShade(ctx, rf, hat.kind);
    hair("front");
    paintExtras(ctx, rf, face);
    paintHat(ctx, rs(`hat-${hat.kind}`), hat);
  });

  paintArms(ctx, rs(`arms-${p.body}-${pose}`), g, o, p.skin, pose, "front");
  ctx.restore();

  if (bust) {
    // Let the bottom edge run out, like a wash that was not carried on.
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    const r = rs("fade");
    wash(ctx, ellipse(w / 2, h + 5, w * 0.8, 15, 16), "ink", {
      r,
      layers: 10,
      strength: 0.99,
      soft: 0.25,
      edge: 0,
    });
    ctx.restore();
  }
}
