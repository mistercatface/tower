import { gameWorldSurfaceSettings } from "../WorldSurfaceBootstrap.js";
import { createGroundChunkBakePayload } from "../../Libraries/WorldSurface/bake/SurfaceBakeHelpers.js";
import { surfaceProfileDefaults } from "../../Libraries/Procedural/SurfaceProfileProvider.js";
/** @typedef {import("../../GameState/GameState.js").GameState} GameState */
export function resolveSurfaceProfileAtCoords(state, x, y) {
    if (state.worldSurfaces.surfaceProfileOverride) return state.worldSurfaces.surfaceProfileOverride;
    return surfaceProfileDefaults.defaultId;
}
/** Worker-serializable ground-chunk bake payload from live game state. */
export function buildGroundChunkBakePayload(state, chunkCol, chunkRow, zLevel = 0, profileId = null) {
    const obstacleGrid = state.obstacleGrid;
    const settings = gameWorldSurfaceSettings;
    const cellsPerChunk = settings.cellsPerChunk;
    const chunkSizePx = obstacleGrid.cellSize * cellsPerChunk;
    const centerX = obstacleGrid.minX + chunkCol * chunkSizePx + chunkSizePx / 2;
    const centerY = obstacleGrid.minY + chunkRow * chunkSizePx + chunkSizePx / 2;
    const resolvedProfileId = profileId ?? resolveSurfaceProfileAtCoords(state, centerX, centerY);
    return createGroundChunkBakePayload({
        chunkCol,
        chunkRow,
        minX: obstacleGrid.minX,
        minY: obstacleGrid.minY,
        seed: state.worldSurfaces.worldSurfaceSeed ?? 0,
        profileId: resolvedProfileId,
        centerX,
        centerY,
        zLevel,
    });
}
