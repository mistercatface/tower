import { buildGameMapRenderCaches, buildTopologyMapRenderCaches } from "../../Render/map/MapRenderCache.js";
import { withSeededRandom } from "../../Random/index.js";
import { getRoguelikeMapSession } from "./roguelikeMapSession.js";
/**
 * Headless roguelike map regeneration: world gen, render caches, and session reset.
 * Does not touch DOM or path-test UI.
 *
 * @param {object} state
 * @param {{ mapSeed: number, floorSeed: number, generateWorld: (state: object) => void, canvasSize?: { width: number, height: number } | null }} options
 */
export function regenerateRoguelikeMap(state, { mapSeed, floorSeed, generateWorld, canvasSize = null }) {
    if (canvasSize && state.viewport) state.viewport.setCanvasSize(canvasSize.width, canvasSize.height);
    withSeededRandom(mapSeed, () => {
        generateWorld(state);
    });
    buildGameMapRenderCaches(state);
    buildTopologyMapRenderCaches(state);
    state.worldSurfaces.worldSurfaceSeed = floorSeed;
    state.worldSurfaces.clearBakeCache();
    state.mapSeed = mapSeed;
    state.floorSeed = floorSeed;
    getRoguelikeMapSession(state).selectedNodeId = null;
}
