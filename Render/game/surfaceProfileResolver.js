import { getGameWorldSurfaceSettings } from "../WorldSurfaceBootstrap.js";
import { createGroundChunkBakePayload, isGroundChunkAnimationEnabled } from "../../Libraries/WorldSurface/bake/SurfaceBakeHelpers.js";
import { getSurfaceProfileProvider } from "../../Libraries/Procedural/SurfaceProfileProvider.js";
/** @typedef {import("../../GameState/GameState.js").GameState} GameState */
export function resolveSurfaceProfileAtCoords(state, x, y) {
    if (state.worldSurfaces.surfaceProfileOverride) return state.worldSurfaces.surfaceProfileOverride;
    let closestNode = null;
    let minDist = Infinity;
    for (const node of state.mapNodes) {
        const coords = state.getNodeWorldCoords(node);
        const dist = Math.hypot(x - coords.x, y - coords.y);
        if (dist < minDist) {
            minDist = dist;
            closestNode = node;
        }
    }
    if (closestNode?.surfaceProfileId) return closestNode.surfaceProfileId;
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
    const profile = getSurfaceProfileProvider().getProfile(profileId);
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
        texelResolution: settings.texelResolution,
        gameTime: zLevel === 0 && isGroundChunkAnimationEnabled(profile, settings) ? (state.gameTime ?? 0) : undefined,
    });
}
