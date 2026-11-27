// @ts-check
/**
 * Honey Hollow: the game core. Pure: no DOM, no clock, no Math.random, no
 * storage. The screens, the bots and the tests import only this file.
 *
 *   newGame(seed)          a fresh state: the morning of day 1, keeper not yet made
 *   loadSave(raw)          a saved state made playable, or null to start fresh
 *   step(state, action)    → { state, events }; the only way the game changes
 *
 * Everything else is content and read-only helpers for drawing the state.
 * Module map: state.js (slices, saves) · step.js (the action list) ·
 * calendar.js (seasons, weather, bloom, the day cycle, the night card) ·
 * land.js (plots, squares, planting, reach) · hives.js (forage plan and
 * forecast, stores, harvest, growth, swarms, mites, wasps) · market.js
 * (products, prices, customers, the Show and the Fair) · workshop.js
 * (recipes) · progress.js (renown, goals, shop, stats, year end) · book.js
 * (trigger keys → facts) · keeper.js (look, talent, wardrobe) · rng.js
 * (named random streams) · util.js.
 *
 * docs/honey-hollow/architecture.md describes the state, every action,
 * event and `why` code.
 */

export { newGame, loadSave, SLICES } from "./state.js";
export { step, ACTIONS } from "./step.js";

// Content, re-exported so nothing outside needs to reach into content/.
import * as TUNING from "../content/tuning.js";
export { TUNING };
export { FLOWERS, FLOWER_IDS, BUNCHES } from "../content/flowers.js";
export { HONEYS, HONEY_IDS, TRAITS, TRAIT_NAMES } from "../content/honeys.js";
export { HIVES, HIVE_IDS } from "../content/hives.js";
export { PLOTS, PLOT_IDS, TERRAIN, START } from "../content/plots.js";
export { GOODS, GOOD_IDS, RECIPES, RECIPE_IDS, FAMILIES } from "../content/goods.js";
export { REGULARS, REGULAR_IDS } from "../content/regulars.js";
export { GOALS, GOAL_IDS, TIERS } from "../content/goals.js";
export { WARDROBE, LOOK_PARTS, DEFAULT_LOOK, HAIR_TWINS } from "../content/wardrobe.js";
export { TALENTS, TALENT_IDS } from "../content/talents.js";
export { FACTS } from "../content/facts.js";

// Read-only helpers.
export {
  calendarOf,
  bloomWindow,
  inBloom,
  stageOf,
  treeStageOf,
  flightOf,
  flightFor,
  fliesToday,
  tomorrow,
  flowersKnown,
  daysUntil,
  bloomsWith,
} from "./calendar.js";
export {
  terrainAt,
  squareAt,
  reachOf,
  nearWater,
  canPlant,
  canPlaceHive,
  canBuyPlot,
  flowerOpen,
  whereGrows,
} from "./land.js";
export {
  forecast,
  forecastPlot,
  verdictOf,
  totalOf,
  jarsIn,
  capacityOf,
  limitOf,
  mealOf,
  winterNeed,
  hiveCost,
  upgradeOf,
  attentionOf,
  hiveById,
  spoils,
  hiveNumber,
  careOf,
  canBuyHive,
  canCatchSwarm,
  newHiveType,
} from "./hives.js";
export {
  priceOf,
  quote,
  grocerQuote,
  shelf,
  satisfies,
  productInfo,
  makeable,
  customersFor,
} from "./market.js";
export { recipesNow, craftsLeft, waxFor, workshopOpen, canCraftNow } from "./workshop.js";
export { goalsNow, measure, MEASURES, tierOf, shopNow, yearDue, GOALS_OPEN } from "./progress.js";
export { talentOf, owns, wardrobeNow, hairFor } from "./keeper.js";
export { TRIGGERS } from "./book.js";
