import { projectWorldAabbCornersInto } from "../Spatial/iso/IsometricProjection.js";
import { chunkWorldAabbScratch, forEachObstacleGridCellInAabb } from "../Spatial/grid/GridCoords.js";
import { traceAabbRect, clipToPath } from "../Canvas/CanvasPath.js";
import { resolveCellWallHeightAtIdx } from "../Spatial/grid/gridCellTopology.js";
import { railWallFootprintAabb, forEachEmittingRailWallAtZLevel } from "../World/wallGridBake.js";
export function projectHorizontalSurfaceCornersInto(out4, originX, originY, sizePx, zLevel, camera) {
    return projectWorldAabbCornersInto(out4, originX, originY, originX + sizePx, originY + sizePx, zLevel, camera);
}
export function clipChunkToBlockedCells(ctx, obstacleGrid, originX, originY, sizePx) {
    const chunkAabb = chunkWorldAabbScratch(originX, originY, sizePx);
    return clipToPath(ctx, (clipCtx) => {
        let clippedAny = false;
        forEachObstacleGridCellInAabb(obstacleGrid, chunkAabb, (col, row, idx) => {
            if (obstacleGrid.grid[idx] === 0) return;
            traceAabbRect(clipCtx, obstacleGrid.getCellBounds(col, row));
            clippedAny = true;
        });
        return clippedAny;
    });
}
export function clipChunkToFlatWallFootprints(ctx, obstacleGrid, originX, originY, sizePx, zLevel) {
    const chunkAabb = chunkWorldAabbScratch(originX, originY, sizePx);
    return clipToPath(ctx, (clipCtx) => {
        let clippedAny = false;
        forEachObstacleGridCellInAabb(obstacleGrid, chunkAabb, (col, row, idx) => {
            const cellZ = resolveCellWallHeightAtIdx(obstacleGrid, idx);
            if (cellZ === zLevel) {
                traceAabbRect(clipCtx, obstacleGrid.getCellBounds(col, row));
                clippedAny = true;
            }
        });
        forEachEmittingRailWallAtZLevel(obstacleGrid, chunkAabb, zLevel, (col, row, side) => {
            traceAabbRect(clipCtx, railWallFootprintAabb(obstacleGrid, col, row, side));
            clippedAny = true;
        });
        return clippedAny;
    });
}
export function clipChunkToStaticEdgeRails(ctx, obstacleGrid, originX, originY, sizePx, zLevel) {
    const chunkAabb = chunkWorldAabbScratch(originX, originY, sizePx);
    return clipToPath(ctx, (clipCtx) => {
        let clippedAny = false;
        forEachEmittingRailWallAtZLevel(obstacleGrid, chunkAabb, zLevel, (col, row, side) => {
            traceAabbRect(clipCtx, railWallFootprintAabb(obstacleGrid, col, row, side));
            clippedAny = true;
        });
        return clippedAny;
    });
}
