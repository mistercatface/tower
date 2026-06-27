import { forEachObstacleGridCellInAabb } from "../Spatial/grid/GridCoords.js";
import { traceAabbRect, clipToPath } from "../Canvas/CanvasPath.js";
import { resolveCellWallHeightAtIdx } from "../Spatial/grid/gridCellTopology.js";
import { railWallFootprintAabb, forEachEmittingRailWallAtZLevel } from "../World/wallGridBake.js";
export function clipChunkToFlatWallFootprints(ctx, obstacleGrid, bounds, zLevel) {
    return clipToPath(ctx, (clipCtx) => {
        let clippedAny = false;
        forEachObstacleGridCellInAabb(obstacleGrid, bounds, (col, row, idx) => {
            const cellZ = resolveCellWallHeightAtIdx(obstacleGrid, idx);
            if (cellZ === zLevel) {
                traceAabbRect(clipCtx, obstacleGrid.getCellBounds(col, row));
                clippedAny = true;
            }
        });
        forEachEmittingRailWallAtZLevel(obstacleGrid, bounds, zLevel, (col, row, side) => {
            traceAabbRect(clipCtx, railWallFootprintAabb(obstacleGrid, col, row, side));
            clippedAny = true;
        });
        return clippedAny;
    });
}
