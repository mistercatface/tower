import { buildMapRenderCaches } from "../../../Libraries/Render/map/MapRenderCache.js";
import { finalizeGeneratedWorld } from "../../../Libraries/WorldGen/finalizeGeneratedWorld.js";
import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { sandboxController } from "./tilelabSandbox.js";
import { generateCavernWalls } from "./generateCaverns.js";
export const labCavernConfig = { halfWidth: 1600, halfHeight: 1600, fillChance: 0.45, iterations: 3 };
/** @param {import("../state.js").TileLabGameState} state */
export function generateLabCaverns(state) {
    const centerX = state.viewport.x;
    const centerY = state.viewport.y;
    withSeededRandom(state.mapSeed, () => {
        state.walls = generateCavernWalls(centerX, centerY, labCavernConfig);
        state.wallSpatialIndex.clear();
        for (const wall of state.walls) state.wallSpatialIndex.insert(wall);
    });
    finalizeGeneratedWorld(state, { centerX, centerY });
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
    buildMapRenderCaches(state);
    sandboxController?.clearBodies();
}
