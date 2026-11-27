// The paintbox. Art names colours from here and never writes a hex value, so
// the whole game can be re-tinted in one place. Soft, a little greyed, like
// pan watercolours on cream paper.

export const P = {
  paper: "#fbf5e6",
  paperShade: "#efe4cc",
  white: "#fffdf7",
  ink: "#5a4433", // sepia pencil
  inkSoft: "#8a705a",

  // greens
  meadow: "#bcd69b",
  mint: "#a9d4b4",
  sap: "#93b973",
  leaf: "#7dab66",
  moss: "#6c9659",
  sage: "#a7bf9f",
  pine: "#4f7b55",
  olive: "#a3a868",

  // yellows
  cream: "#f6ecd2",
  butter: "#f7e4a0",
  straw: "#e8d08e",
  dandelion: "#f5cf3d",
  sunflower: "#f2b632",
  honey: "#eab04a",
  amber: "#d98f2f",
  gold: "#e0a030",

  // pinks and purples
  blush: "#f8d5d6",
  rose: "#f0b3c0",
  clover: "#e796b3",
  heather: "#c88abb",
  lilac: "#cfc0ec",
  lavender: "#b29fdd",
  violet: "#8e78c8",
  plum: "#73589c",

  // blues
  sky: "#c4e2f1",
  pond: "#9fcdde",
  water: "#74aecb",
  borage: "#7b9fe2",
  dusk: "#8f98c4",

  // browns and reds
  apricot: "#f6c39c",
  peach: "#f4b59a",
  poppy: "#e8806d",
  terracotta: "#d98e6a",
  soil: "#b48d6b",
  wood: "#c99a69",
  bark: "#8c6849",
  umber: "#6b4f39",
  chestnut: "#8a4f33",
  coal: "#4a3d37",

  // greys
  stone: "#bdb7ac",
  cloud: "#e9ebef",
  shadow: "#8e8fb0", // cool violet-grey, for cast shadows
  snow: "#f4f7fb",

  // the meadow painter's extras (flowers, terrain, creatures, sky)
  mauve: "#d9a0cf", // wild thyme
  cornflower: "#5f86d6", // the deep note in borage
  chartreuse: "#cfd66a", // ivy flowers
  heath: "#b5ad85", // dry hill ground
  heathBloom: "#b79fb6", // the purple that hangs over a heath

  // people: skin from light to deep, each with the shade that pools under a
  // chin, and the pinks that warm a cheek
  skin1: "#fde7d6",
  skin1Shade: "#f3c4a8",
  skin2: "#f9d8bb",
  skin2Shade: "#e9af8c",
  skin3: "#efc59d",
  skin3Shade: "#d79c70",
  skin4: "#d9a67b",
  skin4Shade: "#b97f56",
  skin5: "#b98259",
  skin5Shade: "#93603f",
  skin6: "#9b6a4f",
  skin6Shade: "#774a37",
  cheekRose: "#f39aa6",
  cheekCoral: "#ec8372",
  cheekBerry: "#c9574f",
  eye: "#3b2d2c",
  lip: "#cf6f72",

  // hair: the base wash, the darker charge underneath, the lifted highlight
  hairBlack: "#46424f",
  hairBlackDeep: "#2c2933",
  hairBlackLight: "#8a8aa6",
  hairEspresso: "#634536",
  hairEspressoDeep: "#3f2b22",
  hairEspressoLight: "#a37c62",
  hairChestnut: "#93593a",
  hairChestnutDeep: "#643a25",
  hairChestnutLight: "#c9925f",
  hairAuburn: "#ad5234",
  hairAuburnDeep: "#7a3323",
  hairAuburnLight: "#e09263",
  hairCopper: "#d67f3f",
  hairCopperDeep: "#a5572b",
  hairCopperLight: "#f4b878",
  hairHoney: "#e8c170",
  hairHoneyDeep: "#bf9145",
  hairHoneyLight: "#fbeab8",
  hairSilver: "#cdcdd6",
  hairSilverDeep: "#9697ac",
  hairSilverLight: "#f5f5f9",
  hairLilac: "#c3abe8",
  hairLilacDeep: "#9078c6",
  hairLilacLight: "#eadcfa",

  // cloth: dungarees and shirts, each with its fold colour
  denim: "#8eabd0",
  denimDeep: "#6584b1",
  sageDeep: "#7f9e7a",
  mustard: "#e3b54c",
  mustardDeep: "#bf8e31",
  dustyRose: "#dea5ab",
  dustyRoseDeep: "#bd7c86",
  lavenderDeep: "#8f7cc0",
  creamDeep: "#d9c89e",
  butterDeep: "#e2c66f",
  skyDeep: "#93bfd8",
  blushDeep: "#e6aab0",
  mintPale: "#c9e8d2",
  mintDeep: "#93c4a4",
  linen: "#f3ede0",
  waxed: "#74795a",
  waxedDeep: "#555b43",
  tweed: "#a89a86",
  tweedDeep: "#7c6e5e",
  berry: "#b65a6e",
  berryDeep: "#8d3f55",
  boot: "#8a6447",
  bootDeep: "#5f4330",
};

/** "#rrggbb" → [r, g, b] */
export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

/** A colour as an rgba() string. `c` is a hex or a palette name. */
export function rgba(c, a = 1) {
  const [r, g, b] = rgb(P[c] ?? c);
  return `rgba(${r},${g},${b},${a})`;
}

/** Mix two colours; t = 0 gives a, 1 gives b. Returns a hex. */
export function mix(a, b, t) {
  const x = rgb(P[a] ?? a);
  const y = rgb(P[b] ?? b);
  const h = (i) =>
    clamp(x[i] + (y[i] - x[i]) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${h(0)}${h(1)}${h(2)}`;
}

export const lighten = (c, t) => mix(c, "#ffffff", t);
export const darken = (c, t) => mix(c, "#3a2a22", t);

/** Nudge a colour's lightness and warmth by small random amounts. */
export function vary(c, r, amount = 0.05) {
  const [R, G, B] = rgb(P[c] ?? c);
  const l = 1 + r.gauss() * amount;
  const w = r.gauss() * amount * 18;
  const h = (v) => clamp(v).toString(16).padStart(2, "0");
  return `#${h(R * l + w)}${h(G * l)}${h(B * l - w)}`;
}
