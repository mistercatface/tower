/**
 * Per-chunk horizontal surface draw context — built once per visible chunk in `drawGroundChunks`.
 */
import { projectWorldAabbCornersInto } from "../Spatial/iso/IsometricProjection.js";
import { forEachObstacleGridCellInAabb } from "../Spatial/grid/GridCoords.js";
import { traceAabbRect, clipToPath } from "../Canvas/CanvasPath.js";
import { resolveCellWallHeightAtIdx } from "../Spatial/grid/gridCellTopology.js";
import { railWallFootprintAabb, forEachEmittingRailWallAtZLevel } from "../World/wallGridBake.js";
/**
 * @typedef {Object} ChunkDrawPass
 * @property {number} chunkCol
 * @property {number} chunkRow
 * @property {number} originX
 * @property {number} originY
 * @property {number} sizePx
 * @property {number} zLevel
 * @property {import("../Viewport/Viewport.js").Viewport | null} viewport
 * @property {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid | null} obstacleGrid
 * @property {import("../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings | null} settings
 * @property {object | null} state
 * @property {import("../Math/Aabb2D.js").Aabb2D} chunkAabb
 * @property {import("../Spatial/iso/ElevationCamera.js").ElevationCamera} camera
 */
/** @param {ChunkDrawPass} pass @param {{ originX?: number, originY?: number, sizePx?: number, zLevel?: number } | null} [rect] */
function chunkRect(pass, rect = null) {
    return { originX: rect?.originX ?? pass.originX, originY: rect?.originY ?? pass.originY, sizePx: rect?.sizePx ?? pass.sizePx, zLevel: rect?.zLevel ?? pass.zLevel };
}
/**
 * @param {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]} out4
 * @param {ChunkDrawPass} pass
 * @param {{ originX?: number, originY?: number, sizePx?: number, zLevel?: number } | null} [rect]
 */
export function projectHorizontalSurfaceCornersInto(out4, pass, rect = null) {
    const { originX, originY, sizePx, zLevel } = chunkRect(pass, rect);
    return projectWorldAabbCornersInto(out4, originX, originY, originX + sizePx, originY + sizePx, zLevel, pass.camera);
}
/** @param {CanvasRenderingContext2D} ctx @param {ChunkDrawPass} pass @returns {boolean} */
export function clipChunkToBlockedCells(ctx, pass) {
    const { obstacleGrid } = pass;
    return clipToPath(ctx, (clipCtx) => {
        let clippedAny = false;
        forEachObstacleGridCellInAabb(obstacleGrid, pass.chunkAabb, (col, row, idx) => {
            if (obstacleGrid.grid[idx] === 0) return;
            traceAabbRect(clipCtx, obstacleGrid.getCellBounds(col, row));
            clippedAny = true;
        });
        return clippedAny;
    });
}
/** @param {CanvasRenderingContext2D} ctx @param {ChunkDrawPass} pass @returns {boolean} */
export function clipChunkToFlatWallFootprints(ctx, pass) {
    const { obstacleGrid, zLevel } = pass;
    return clipToPath(ctx, (clipCtx) => {
        let clippedAny = false;
        forEachObstacleGridCellInAabb(obstacleGrid, pass.chunkAabb, (col, row, idx) => {
            const cellZ = resolveCellWallHeightAtIdx(obstacleGrid, idx);
            if (cellZ === zLevel) {
                traceAabbRect(clipCtx, obstacleGrid.getCellBounds(col, row));
                clippedAny = true;
            }
        });
        forEachEmittingRailWallAtZLevel(obstacleGrid, pass.chunkAabb, zLevel, (col, row, side) => {
            traceAabbRect(clipCtx, railWallFootprintAabb(obstacleGrid, col, row, side));
            clippedAny = true;
        });
        return clippedAny;
    });
}
/** @param {CanvasRenderingContext2D} ctx @param {ChunkDrawPass} pass @returns {boolean} */
export function clipChunkToStaticEdgeRails(ctx, pass) {
    const { obstacleGrid, zLevel } = pass;
    return clipToPath(ctx, (clipCtx) => {
        let clippedAny = false;
        forEachEmittingRailWallAtZLevel(obstacleGrid, pass.chunkAabb, zLevel, (col, row, side) => {
            traceAabbRect(clipCtx, railWallFootprintAabb(obstacleGrid, col, row, side));
            clippedAny = true;
        });
        return clippedAny;
    });
}
