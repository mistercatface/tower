import { invalidateStaticGridEdgeRailDrawCache } from "../Render/Structure3D/StaticGridEdgeRailDraw.js";
import { invalidateStaticGridWallDrawCache } from "../Render/Structure3D/StaticGridWallDraw.js";
export function invalidateWallDrawCaches() {
    invalidateStaticGridWallDrawCache();
    invalidateStaticGridEdgeRailDrawCache();
}
export function invalidateWallSurfaceDraw(state = null, bounds = null) {
    invalidateWallDrawCaches();
    if (bounds && state?.worldSurfaces?.invalidateGridBounds) state.worldSurfaces.invalidateGridBounds(bounds, state);
}
