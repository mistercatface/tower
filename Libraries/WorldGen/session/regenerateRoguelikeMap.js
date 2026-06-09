import { buildGameMapRenderCaches, buildTopologyMapRenderCaches } from "../../Render/map/MapRenderCache.js";
import { withSeededRandom } from "../../Random/index.js";
import { getRoguelikeMapSession } from "./roguelikeMapSession.js";
/**
 * Headless roguelike map regeneration: world gen, render caches, and session reset.
 * Does not touch DOM, viewport, or path-test UI.
 *
 * @param {object} state
 * @param {{ mapSeed: number, floorSeed: number, generateWorld: (state: object) => void, canvasBounds?: { width: number, height: number } | null }} options
 */
export function regenerateRoguelikeMap(state, { mapSeed, floorSeed, generateWorld, canvasBounds = null }) {
    if (canvasBounds) state.canvasBounds = { ...canvasBounds };
    withSeededRandom(mapSeed, () => {
        generateWorld(state);
    });
    buildGameMapRenderCaches(state);
    buildTopologyMapRenderCaches(state);
    state.worldSurfaceSeed = floorSeed;
    state.worldSurfaces.clear();
    state.mapSeed = mapSeed;
    state.floorSeed = floorSeed;
    getRoguelikeMapSession(state).selectedNodeId = null;
}
