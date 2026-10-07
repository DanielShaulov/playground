/**
 * What the ground costs to cross (world.md §1–2), for any party: yours by
 * your culture's ways (army.md §4), the wild's — brigands, wolves — by
 * none. Shared by world.js and parties.js.
 */
import { findPath } from "./hex.js";
import {
  TERRAIN,
  T,
  ROAD,
  FORD,
  BRIDGE,
  ROAD_COST,
  FORD_COST,
  BRIDGE_COST,
  CULTURE_TRAVEL,
} from "./data/world.js";

/** What crossing into hex i costs a party of `culture`, in cost-1 hexes. */
export function hexCost(realm, i, culture) {
  const t = realm.terrain[i];
  const f = realm.flags[i];
  let c;
  if (t === T.river) c = f & BRIDGE ? BRIDGE_COST : f & FORD ? FORD_COST : Infinity;
  else {
    c = TERRAIN[t].cost;
    const adj = CULTURE_TRAVEL[culture].cost[TERRAIN[t].id];
    if (adj === "plains") c = TERRAIN[T.plains].cost;
    else if (adj) c += adj;
  }
  return f & ROAD ? c * ROAD_COST : c;
}

/**
 * The cheapest any hex of this realm costs a culture: A*'s guess at what's
 * left is this per hex, so the closer it is the less of the map it searches.
 */
function least(realm, culture) {
  realm.least ??= {};
  if (realm.least[culture] == null) {
    let m = Infinity;
    for (let i = 0; i < realm.grid.n; i++) m = Math.min(m, hexCost(realm, i, culture));
    realm.least[culture] = m;
  }
  return realm.least[culture];
}

/** The cheapest hexes from `from` to `to` for a culture, cached per realm. */
export function pathFor(realm, culture, from, to) {
  const key = `${culture}:${from}>${to}`;
  if (realm.paths.has(key)) return realm.paths.get(key);
  const found = findPath(
    realm.grid,
    from,
    to,
    (i) => hexCost(realm, i, culture),
    least(realm, culture),
  );
  const path = found ? found.path : null;
  if (realm.paths.size > 400) realm.paths.clear();
  realm.paths.set(key, path);
  return path;
}
