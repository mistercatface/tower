import { chunkWorldAabbScratch, forEachObstacleGridCellInAabb } from "../Spatial/grid/GridCoords.js";
import { traceAabbRect, clipToPath } from "../Canvas/CanvasPath.js";
import { resolveCellWallHeightAtIdx } from "../Spatial/grid/gridCellTopology.js";
import { railWallFootprintAabb, forEachEmittingRailWallAtZLevel } from "../World/wallGridBake.js";
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
