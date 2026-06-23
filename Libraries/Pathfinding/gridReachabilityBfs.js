import { OCTILE_NEIGHBOR_GRID_LAYOUT } from "./neighborGridLayout.js";
import { gridPathStepsBfs } from "./gridPathStepsBfs.js";
export function gridReachabilityBfs(grid, startIdx, targetIdx, isBlocked) {
    return (
        gridPathStepsBfs({
            neighborGrid: grid.neighbors,
            cellCount: grid.cellCount,
            neighborLayout: grid.neighborLayout ?? OCTILE_NEIGHBOR_GRID_LAYOUT,
            isBlocked,
            startIdx,
            targetIdx,
            maxSteps: 0x7fffffff,
        }) !== null
    );
}
