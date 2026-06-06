import { buildMapRenderCaches } from "../../Render/Map/MapRenderCache.js";
import { syncSurfaceProfile } from "../../Render/game/surfaceProfileResolver.js";
/**
 * Shared post-generation steps after walls are in `state.walls` / spatial index.
 *
 * @param {object} state
 * @param {{ centerX: number, centerY: number }} focus — hnav + flow-field anchor
 */
export function finalizeGeneratedWorld(state, { centerX, centerY }) {
    state.obstacleGrid.rebuild(state.walls);
    state.hierarchicalNavigator.initialize(centerX, centerY);
    buildMapRenderCaches(state);
    state.worldSurfaceSeed = (Math.random() * 0x7fffffff) | 0;
    state.worldSurfaces.clear();
    syncSurfaceProfile(state);
}
