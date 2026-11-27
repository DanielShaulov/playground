# Art

The look is loose line-and-wash, like a picture book: soft watercolour
shapes, a wobbly sepia pencil line drawn a little out of register on top,
cream paper showing through. Sari asked for "whimsical and pretty, more
watercolor style". If a piece is correct but not pretty, it is not done.

Everything is painted by the game itself, once, into cached bitmaps
(`ui/paint/`). There are no image files and nothing is painted per frame.

## See it

```sh
npm start
# every piece:        http://localhost:8000/games/honey-hollow/art-gallery.html
# one sheet, closer:  .../art-gallery.html?only=flowers&zoom=3
```

Take a screenshot and look at it (Chromium is at `/opt/pw-browsers/chromium`;
use `deviceScaleFactor: 2` or `3`, phones are never 1). Look at each piece at
the size it will have on a phone: a meadow square is 52 to 70 px wide.

The pieces that set the bar are the lavender, clover and dandelion beds in
`ui/art/flowers.js`, the skep and box hives in `ui/art/hives.js` and the jar
in `ui/art/jars.js`. Read those before painting anything new, and put a new
piece beside them in the gallery to check it belongs.

## The tools (`ui/paint/wash.js`)

- `wash(ctx, shape, color, { r, strength, soft, layers, charge, glaze, edge })`
  A soft-edged fill. `soft` 0.05 is a crisp shape (a jar, a box), 0.2 a normal
  one, 0.5 a wet blot. `charge` drops a second colour in while wet, which is
  what stops a fill looking flat. Small dabs need only 4 to 6 `layers`.
- `brush(ctx, path, color, { r, width })` One stroke: stems, grass, hair.
- `pencil(ctx, points, { r, closed, alpha, width, gaps })` The loose outline.
  Keep it light (alpha 0.4 to 0.6) and incomplete (`gaps`). Not every shape
  gets one: flowers mostly do without, made things (hives, jars, people) get
  one.
- `shadow(ctx, cx, cy, rx, ry, r)` A cool violet-grey pool under anything
  that stands on the ground.
- `lift` takes paint off for a highlight; `gouache` adds an opaque white
  touch; `splatter` flicks specks; `hatch` shades with short pencil strokes.
- Shapes: `ellipse`, `blob`, `rect`, `roundRect`, `petal`, `leaf`,
  `smooth(points)` (a curve through a few hand-placed points), `ribbon`,
  `resample` (do this to any shape bigger than ~60 px before washing it, or
  its edge flails), `within(ctx, shape, paint)` (clip).
- `sprite(key, w, h, draw, { ax, ay, scale })` paints once and caches. `r`
  comes seeded from the key, so a piece is the same on every phone. Never
  use `Math.random`.
- Colours come from `ui/paint/palette.js` by name. Add a colour there if you
  need one; never write a hex in an art file (the honey colours table is the
  one exception, and it lives in one place).

## Rules of thumb

1. **Back to front, big to small.** Shadow, large washes, smaller washes,
   dabs, pencil, specks.
2. **Two or three colours per thing.** A base, a darker charge, a pale touch.
   Lavender is violet, lavender and lilac dabs, not one purple.
3. **Leave paper.** Highlights are unpainted or lifted, not white paint.
   Keep `strength` under 0.95; let washes be uneven.
4. **Nothing is straight, nothing is centred.** Lean stems, vary sizes,
   let dabs miss their outline.
5. **Readable at 56 px.** Squint. If a flower cannot be told from the others
   by its silhouette and colour at meadow size, change the silhouette.
6. **Cheap.** A bed sprite should paint in under ~40 ms on a laptop (phones
   are 3 to 4 times slower). The gallery prints the time per sheet. Use few
   layers on small shapes.
7. **Pieces share a ground line.** Anything that stands on the meadow is
   anchored at its feet (`ay` about 0.9) with its shadow just below.

## Type

`ui/fonts/` holds Mali (Regular and Bold, Latin subset, OFL), a rounded
hand-lettered face that suits the pictures and stays readable small. It is
the only face; numbers use its tabular forms where they line up.

## People

The beekeeper is the piece Sari will look at hardest. Her note on the first
mock was "the hair looks bad and too thin". So: hair is a big soft mass with
volume, painted as overlapping washes with a darker charge and a few brush
strands, never a thin cap. Faces are simple and kind: dot eyes, a small
smile, rosy cheeks. Proportions are picture-book (a large head, about a third
of the height). Both the woman and the man must be charming.
