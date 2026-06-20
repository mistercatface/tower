import { invalidateStaticGridEdgeRailDrawCache } from "../Render/Structure3D/StaticGridEdgeRailDraw.js";
import { invalidateStaticGridWallDrawCache } from "../Render/Structure3D/StaticGridWallDraw.js";
import { getGridWallDamageSession } from "./gridWallDamage.js";
/** @param {object} state @param {import("../DataStructures/CellRect.js").CellBounds} bounds */
export function invalidateWallDamageDraw(state, bounds) {
    const session = getGridWallDamageSession(state);
    if (session) session.damageRevision = (session.damageRevision + 1) | 0;
    invalidateStaticGridWallDrawCache();
    invalidateStaticGridEdgeRailDrawCache();
    if (bounds && state.worldSurfaces?.invalidateGridBounds) state.worldSurfaces.invalidateGridBounds(bounds, state);
}
