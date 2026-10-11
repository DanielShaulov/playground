// @ts-check
/**
 * The recipe card on the bench: what you have learned about one base recipe.
 * It fills itself in from state.bench (via core recipeCard()): when a plain
 * jar is most wanted, what each add-in did once you have mixed it in (in hours), and the recipes
 * discovered from this base as known, hinted (only the tags) or hidden.
 * A line that just turned known flashes once.
 */

import { RECIPES } from "../content/recipes.js";
import { INGREDIENTS } from "../content/ingredients.js";
import { ageAt, demand } from "../core/index.js";

/** Card line key → when it was first seen known (performance.now()). */
const seenAt = new Map();
/** Base recipes whose card has been drawn at least once (no flash on first sight). */
const drawn = new Set();
const FLASH_MS = 1600;

const TAG_WORD = { slower: "slower", faster: "faster", sweet: "sweet", funk: "funky" };

/** "8h sooner" / "7h later" / "same" for a move of `h` hours earlier. */
const when = (h) =>
  h >= 0.5 ? `${Math.round(h)}h sooner` : h <= -0.5 ? `${Math.round(-h)}h later` : "same";

/** What a timing-free add-in did: the discovered recipes it is part of, or nothing alone. */
function flavourLine(card, ingredient) {
  const made = card.found.filter((f) => f.state === "known" && f.needs.includes(ingredient));
  const name = RECIPES[card.recipe].name.toLowerCase();
  return made.length
    ? made.map((f) => `goes into ✨ ${RECIPES[f.recipe].name}`).join(", ")
    : `no new ${name} on its own`;
}

/** @param {import("../core/types.js").RecipeCard} card */
export function recipeCardHtml(card) {
  const now = performance.now();
  const first = !drawn.has(card.recipe);
  drawn.add(card.recipe);
  const fresh = (key, known) => {
    if (!known) return "";
    if (!seenAt.has(key)) seenAt.set(key, first ? -Infinity : now);
    return now - seenAt.get(key) < FLASH_MS ? " new" : "";
  };
  const name = RECIPES[card.recipe].name;
  const lines = [
    `<li class="ok">✓ Plain jar is most wanted around ${Math.round(ageAt(card.recipe, [], demand(card.recipe).mean))}h</li>`,
  ];
  // What each add-in you have tried did to this recipe, in hours: the card
  // records the result, not the tag the pantry already shows.
  const mid = (adds) => ageAt(card.recipe, adds, demand(card.recipe).mean);
  const untried = [];
  for (const e of card.effects) {
    const g = INGREDIENTS[e.ingredient];
    if (!e.known) {
      untried.push(g.icon);
      continue;
    }
    const key = `${card.recipe}:${e.ingredient}`;
    const best = mid([]) - mid([e.ingredient]);
    const pop = ageAt(card.recipe, [], 1) - ageAt(card.recipe, [e.ingredient], 1);
    lines.push(
      Math.abs(best) < 0.5 && Math.abs(pop) < 0.5
        ? `<li class="ok${fresh(key, true)}" data-line="${key}">${g.icon} ${g.name}: ${flavourLine(card, e.ingredient)}</li>`
        : `<li class="ok${fresh(key, true)}" data-line="${key}">${g.icon} ${g.name}: most wanted ${when(best)} · pops ${when(pop)}</li>`,
    );
  }
  if (untried.length)
    lines.push(
      `<li class="unk" data-line="${card.recipe}:untried">? Not tried in ${name.toLowerCase()} yet: ${untried.join(" ")}</li>`,
    );
  for (const f of card.found) {
    const key = `${card.recipe}:${f.recipe}`;
    const r = RECIPES[f.recipe];
    if (f.state === "known") {
      const needs = f.needs.map(
        (n) => INGREDIENTS[n].icon + " " + INGREDIENTS[n].name.toLowerCase(),
      );
      lines.push(
        `<li class="ok found${fresh(key, true)}" data-line="${key}">✨ ${r.name} = ${needs.join(" + ")} · 🪙${r.price}</li>`,
      );
    } else if (f.state === "hinted") {
      const what = f.tags.map((t) => `something ${TAG_WORD[t] ?? t}`).join(" + ");
      lines.push(
        `<li class="unk found" data-line="${key}">? ${what[0].toUpperCase() + what.slice(1)} makes a new ${name.toLowerCase()}</li>`,
      );
    } else {
      lines.push(
        `<li class="unk found secret" data-line="${key}">? A secret ${name.toLowerCase()} still to find</li>`,
      );
    }
  }
  return `<h3>Recipe card · <span>${name}</span></h3><ul>${lines.join("")}</ul>`;
}
