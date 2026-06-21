import { bfsTypedIndices } from "../DataStructures/gridBfs.js";
import { OCTILE_NEIGHBOR_GRID_LAYOUT } from "./neighborGridLayout.js";
export function gridReachabilityBfs(grid, startIdx, targetIdx, isBlocked) {
    if (startIdx === targetIdx) return !isBlocked(startIdx);
    if (isBlocked(startIdx) || isBlocked(targetIdx)) return false;
    const neighborGrid = grid.neighbors;
    const neighborLayout = grid.neighborLayout ?? OCTILE_NEIGHBOR_GRID_LAYOUT;
    const gridSize = grid.cellCount;
    return (
        bfsTypedIndices(startIdx, gridSize, (currIdx, visited, enqueue) => {
            if (currIdx === targetIdx) return true;
            for (let i = 0; i < neighborLayout.directionCount; i++) {
                const nIdx = neighborGrid[neighborLayout.cellOffset(currIdx, i)];
                if (nIdx === -1 || visited[nIdx] || isBlocked(nIdx)) continue;
                enqueue(nIdx);
            }
        }) === true
    );
}
