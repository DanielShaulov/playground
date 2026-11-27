// Rule tests for the beekeeper: making one, changing the look, the four
// talents, and the wardrobe rows the screens read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { C, LOOK, ok, no, edit, fresh, one } from "./helpers.mjs";

const make = (keeper) => ({ type: "createKeeper", keeper });
const tess = { ...LOOK, talent: "selling" };

test("a new game waits for its keeper, and takes nothing that is not an action", () => {
  const g = C.newGame(5);
  no(g, { type: "startDay" }, "no-keeper");
  no(g, { type: "setLook", look: { hat: "veil" } }, "no-keeper");
  for (const junk of [
    null,
    undefined,
    5,
    "startDay",
    {},
    { type: 5 },
    { type: "nope" },
    { type: "__proto__" },
    { type: "toString" },
  ])
    no(g, junk, "unknown-action");
  const made = ok(g, make(tess));
  assert.deepEqual(one(made.events, "keeperMade").keeper, made.state.keeper);
  assert.deepEqual(made.state.keeper, {
    made: true,
    name: "Tess",
    body: "woman",
    skin: "s2",
    hair: "braid",
    hairColor: "h3",
    overalls: "o1",
    shirt: "t1",
    hat: "straw",
    beard: "none",
    glasses: "none",
    talent: "selling",
  });
  no(made.state, make(tess), "already-made");
  no(made.state, { type: "nope" }, "unknown-action");
});

test("createKeeper: a name of one to fourteen characters, a look made of pieces already owned, and one talent", () => {
  const g = C.newGame(5);
  for (const keeper of [null, "x", 7, []]) no(g, make(keeper), "bad-look");
  for (const name of ["", "   ", "x".repeat(15), "a\u0007b", 7, undefined])
    no(g, make({ ...tess, name }), "bad-name");
  no(g, make({ ...tess, hair: "mohawk" }), "bad-look");
  no(g, make({ ...tess, hat: "rosette" }), "bad-look");
  no(g, make({ ...tess, skin: undefined }), "bad-look");
  no(g, make({ ...tess, talent: "luck" }), "bad-talent");
  no(g, make({ ...LOOK }), "bad-talent");
  assert.equal(
    ok(g, make({ ...tess, name: "  Tess   of  Hollow " })).state.keeper.name,
    "Tess of Hollow",
  );
  assert.equal(ok(g, make({ ...tess, name: "x".repeat(14) })).state.keeper.name.length, 14);
  const k = ok(
    g,
    make({
      ...tess,
      body: "man",
      hair: "braid",
      beard: "full",
      glasses: "round",
      talent: "whisperer",
    }),
  ).state.keeper;
  assert.deepEqual(
    [k.body, k.hair, k.beard, k.glasses, k.talent],
    ["man", "braid", "full", "round", "whisperer"],
    "any hair may be worn on either body",
  );
});

test("setLook: the name and any part of the look can change; the talent is for keeps", () => {
  const s = fresh();
  const look = (look) => ({ type: "setLook", look });
  const r = ok(s, look({ name: " Bea ", hat: "veil", hair: "cropped" }));
  assert.deepEqual(
    [
      r.state.keeper.name,
      r.state.keeper.hat,
      r.state.keeper.hair,
      r.state.keeper.talent,
      r.state.keeper.skin,
    ],
    ["Bea", "veil", "cropped", "selling", "s2"],
  );
  assert.deepEqual(one(r.events, "lookSet").keeper, r.state.keeper);
  for (const bad of [
    null,
    "veil",
    {},
    { talent: "whisperer" },
    { made: false },
    { hat: "crown" },
    { shoes: "boots" },
  ])
    no(s, look(bad), "bad-look");
  no(s, look({ name: "" }), "bad-name");
  no(s, look({ hat: "rosette" }), "not-in-wardrobe");
  const earned = edit(s, (s) => s.wardrobe.owned.push("rosette"));
  assert.equal(ok(earned, look({ hat: "rosette" })).state.keeper.hat, "rosette");
  assert.deepEqual(
    [
      C.owns(s, "hat", "rosette"),
      C.owns(earned, "hat", "rosette"),
      C.owns(s, "hat", "straw"),
      C.owns(s, "hair", "tousled"),
      C.owns(s, "shoes", "boots"),
      C.owns(s, "hat", "crown"),
    ],
    [false, true, true, true, false, false],
  );
});

test("talents: four, each changing its own numbers", () => {
  assert.deepEqual(C.TALENT_IDS, ["green-thumb", "selling", "whisperer", "clever-hands"]);
  const effects = C.TALENT_IDS.map((id) => {
    const { id: _id, name: _name, blurb: _blurb, ...rest } = C.TALENTS[id];
    return rest;
  });
  assert.deepEqual(effects, [
    { bloomDays: 1 },
    { pay: 1.1 },
    { growDays: 1, mites: 0.7 },
    { crafts: 1, wax: -1 },
  ]);
  assert.equal(C.talentOf(C.newGame(1)).id, "", "no talent before the keeper is made");
  assert.equal(C.talentOf(fresh(1, "whisperer")), C.TALENTS.whisperer);
  assert.deepEqual(
    [C.bloomWindow(fresh(1, "green-thumb"), "clover"), C.bloomWindow(fresh(), "clover")],
    [
      { from: 4, to: 11 },
      { from: 4, to: 10 },
    ],
  );
});

test("wardrobeNow: every piece, whether it is owned and, as data, how it is earned", () => {
  const w = C.wardrobeNow(fresh());
  assert.deepEqual(Object.keys(w), C.LOOK_PARTS);
  assert.deepEqual(
    [w.hair.woman.map((h) => h.id), w.hair.man.map((h) => h.id)],
    [C.WARDROBE.hair.woman.map((h) => h.id), C.WARDROBE.hair.man.map((h) => h.id)],
  );
  const hats = Object.fromEntries(w.hat.map((h) => [h.id, h]));
  assert.deepEqual(hats.straw, {
    id: "straw",
    name: "Straw hat",
    owned: true,
    unlock: { start: true, type: "start", id: null },
  });
  assert.deepEqual(hats["flower-crown"], {
    id: "flower-crown",
    name: "Flower crown",
    owned: false,
    unlock: { gift: ["posy", 2], type: "regular", id: "posy", n: 2, hearts: 7 },
  });
  assert.deepEqual(hats.knit.unlock, { goal: "winter-ready", type: "goal", id: "winter-ready" });
  assert.deepEqual(hats["golden-veil"].unlock, { tier: 4, type: "tier", id: 4 });
  assert.deepEqual(hats.rosette.unlock, { ribbon: true, type: "show", id: null });
  const rows = [
    ...w.hair.woman,
    ...w.hair.man,
    ...C.LOOK_PARTS.filter((p) => p !== "hair").flatMap((p) => w[p]),
  ];
  for (const row of rows) {
    assert.ok(
      ["start", "goal", "tier", "regular", "show"].includes(row.unlock.type),
      `${row.id}: ${row.unlock.type}`,
    );
    assert.equal(row.owned, row.unlock.type === "start", row.id);
    assert.ok(row.name.length > 0);
  }
  const later = C.wardrobeNow(edit(fresh(), (s) => s.wardrobe.owned.push("knit")));
  assert.equal(later.hat.find((h) => h.id === "knit").owned, true);
  // The rows are the caller's own: writing to one does not reach the content.
  hats.straw.unlock.type = "changed";
  assert.equal(C.wardrobeNow(fresh()).hat[1].unlock.type, "start");
  assert.deepEqual(C.WARDROBE.hat[1].unlock, { start: true });
});

test("hairFor: the same hair on the other body", () => {
  for (const [woman, man] of Object.entries(C.HAIR_TWINS)) {
    assert.deepEqual(
      [
        C.hairFor("man", woman),
        C.hairFor("woman", man),
        C.hairFor("woman", woman),
        C.hairFor("man", man),
      ],
      [man, woman, woman, man],
    );
  }
  assert.deepEqual(
    Object.keys(C.HAIR_TWINS).sort(),
    C.WARDROBE.hair.woman.map((h) => h.id).sort(),
    "every woman's style has a twin",
  );
  assert.deepEqual(
    Object.values(C.HAIR_TWINS).sort(),
    C.WARDROBE.hair.man.map((h) => h.id).sort(),
    "and every man's style is one",
  );
  assert.deepEqual(
    [C.hairFor("man", "mohawk"), C.hairFor("woman", "mohawk")],
    ["tousled", "long-waves"],
    "hair nobody has heard of becomes the body's first style",
  );
  assert.equal(C.hairFor("robot", "braid"), "braid");
});
