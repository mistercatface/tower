import { getGameWorldSurfaceSettings } from "../WorldSurfaceBootstrap.js";
import { createGroundChunkBakePayload } from "../../Libraries/WorldSurface/bake/SurfaceBakeHelpers.js";
import { getSurfaceProfileProvider } from "../../Libraries/Procedural/SurfaceProfileProvider.js";
import { centerReachAabbInto, createAabb } from "../../Libraries/Math/Aabb2D.js";
/** @typedef {import("../../GameState/GameState.js").GameState} GameState */
const WALL_PROBE_BOUNDS = createAabb();
export function resolveSurfaceProfileAtCoords(state, x, y) {
    if (state.worldSurfaces.surfaceProfileOverride) return state.worldSurfaces.surfaceProfileOverride;
    return getSurfaceProfileProvider().defaultId;
}
/** @param {GameState} state @param {number} x @param {number} y @param {number} zLevel */
function resolveWallSegmentSurfaceProfileAt(state, x, y, zLevel) {
    const index = state.wallSpatialIndex;
    if (!index) return null;
    const pad = (state.obstacleGrid?.cellSize ?? 4) * 4;
    const walls = index.collectInBounds(centerReachAabbInto(WALL_PROBE_BOUNDS, x, y, pad));
    for (let i = 0; i < walls.length; i++) {
        const wall = walls[i];
        if (wall.isDead || !wall.surfaceProfileId) continue;
        const wallZ = wall.wallHeight;
        if (wallZ != null && Math.abs(wallZ - zLevel) > 0.01) continue;
        return wall.surfaceProfileId;
    }
    return null;
}
/** Worker-serializable ground-chunk bake payload from live game state. */
export function buildGroundChunkBakePayload(state, chunkCol, chunkRow, zLevel = 0) {
    const obstacleGrid = state.obstacleGrid;
    const settings = getGameWorldSurfaceSettings();
    const cellsPerChunk = settings.cellsPerChunk;
    const chunkSizePx = obstacleGrid.cellSize * cellsPerChunk;
    const chunkCenterX = obstacleGrid.minX + chunkCol * chunkSizePx + chunkSizePx / 2;
    const chunkCenterY = obstacleGrid.minY + chunkRow * chunkSizePx + chunkSizePx / 2;
    let profileId = resolveSurfaceProfileAtCoords(state, chunkCenterX, chunkCenterY);
    if (zLevel > 0) {
        const wallProfileId = resolveWallSegmentSurfaceProfileAt(state, chunkCenterX, chunkCenterY, zLevel);
        if (wallProfileId) profileId = wallProfileId;
    }
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
    });
}
