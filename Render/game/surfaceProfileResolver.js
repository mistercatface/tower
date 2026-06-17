import { getGameWorldSurfaceSettings } from "../WorldSurfaceBootstrap.js";
import { createGroundChunkBakePayload } from "../../Libraries/WorldSurface/bake/SurfaceBakeHelpers.js";
import { getSurfaceProfileProvider } from "../../Libraries/Procedural/SurfaceProfileProvider.js";
/** @typedef {import("../../GameState/GameState.js").GameState} GameState */
export function resolveSurfaceProfileAtCoords(state, x, y) {
    if (state.worldSurfaces.surfaceProfileOverride) return state.worldSurfaces.surfaceProfileOverride;
    return getSurfaceProfileProvider().defaultId;
}
/** Worker-serializable ground-chunk bake payload from live game state. */
export function buildGroundChunkBakePayload(state, chunkCol, chunkRow, zLevel = 0) {
    const obstacleGrid = state.obstacleGrid;
    const settings = getGameWorldSurfaceSettings();
    const cellsPerChunk = settings.cellsPerChunk;
    const chunkSizePx = obstacleGrid.cellSize * cellsPerChunk;
    const chunkCenterX = obstacleGrid.minX + chunkCol * chunkSizePx + chunkSizePx / 2;
    const chunkCenterY = obstacleGrid.minY + chunkRow * chunkSizePx + chunkSizePx / 2;
    const profileId = resolveSurfaceProfileAtCoords(state, chunkCenterX, chunkCenterY);
    return createGroundChunkBakePayload({
        chunkCol,
        chunkRow,
        minX: obstacleGrid.minX,
        minY: obstacleGrid.minY,
        seed: state.worldSurfaces.worldSurfaceSeed ?? 0,
        profileId,
        zLevel,
        cellsPerChunk,
        cellSize: settings.cellSize,
        surfaceBakeScale: settings.surfaceBakeScale,
    });
}
