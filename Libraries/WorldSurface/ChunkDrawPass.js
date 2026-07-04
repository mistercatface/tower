import { forEachObstacleGridCellInAabb } from "../Spatial/grid/GridCoords.js";
import { traceAabbRect, clipToPath } from "../Canvas/CanvasPath.js";
import { resolveCellWallHeightAtIdx } from "../Spatial/grid/gridCellTopology.js";
import { railWallFootprintAabb, forEachEmittingRailWallAtZLevel } from "../World/wallGridBake.js";
export function clipChunkToFlatWallFootprints(ctx, obstacleGrid, bounds, zLevel) {
    return clipToPath(ctx, (clipCtx) => {
        let clippedAny = false;
        forEachObstacleGridCellInAabb(obstacleGrid, bounds, (idx) => {
            const cellZ = resolveCellWallHeightAtIdx(obstacleGrid, idx);
            if (cellZ === zLevel) {
                traceAabbRect(clipCtx, obstacleGrid.getCellBoundsByIdx(idx));
                clippedAny = true;
            }
        });
        forEachEmittingRailWallAtZLevel(obstacleGrid, bounds, zLevel, (idx, side) => {
            traceAabbRect(clipCtx, railWallFootprintAabb(obstacleGrid, idx, side));
            clippedAny = true;
        });
        return clippedAny;
    });
}
