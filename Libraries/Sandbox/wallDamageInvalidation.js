import { invalidateStaticGridEdgeRailDrawCache } from "../Render/Structure3D/StaticGridEdgeRailDraw.js";
import { invalidateStaticGridWallDrawCache } from "../Render/Structure3D/StaticGridWallDraw.js";
import { getGridWallDamageState } from "./gridWallDamage.js";
export function invalidateWallDrawCaches() {
    invalidateStaticGridWallDrawCache();
    invalidateStaticGridEdgeRailDrawCache();
}
/**
 * Invalidate static wall/rail draw caches. Optionally bump damage tint revision and patch world surfaces.
 * @param {object | null} state
 * @param {{ bounds?: import("../DataStructures/CellRect.js").CellBounds, bumpDamageRevision?: boolean }} [opts]
 */
export function invalidateWallSurfaceDraw(state = null, { bounds = null, bumpDamageRevision = false } = {}) {
    if (bumpDamageRevision && state) {
        const session = getGridWallDamageState(state)?.session;
        if (session) session.damageRevision = (session.damageRevision + 1) | 0;
    }
    invalidateWallDrawCaches();
    if (bounds && state?.worldSurfaces?.invalidateGridBounds) state.worldSurfaces.invalidateGridBounds(bounds, state);
}
/** Regional damage-tint refresh (bumps damageRevision + draw caches). */
/** @param {object} state @param {import("../DataStructures/CellRect.js").CellBounds} bounds */
export function invalidateWallDamageDraw(state, bounds) {
    invalidateWallSurfaceDraw(state, { bounds, bumpDamageRevision: true });
}
