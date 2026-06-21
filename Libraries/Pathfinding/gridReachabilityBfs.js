import { bfsTypedIndices } from "../DataStructures/gridBfs.js";
export function gridReachabilityBfs(grid, startIdx, targetIdx, isBlocked) {
    if (startIdx === targetIdx) return !isBlocked(startIdx);
    if (isBlocked(startIdx) || isBlocked(targetIdx)) return false;
    const neighborGrid = grid.neighbors;
    const gridSize = grid.cellCount;
    return (
        bfsTypedIndices(startIdx, gridSize, (currIdx, visited, enqueue) => {
            if (currIdx === targetIdx) return true;
            for (let i = 0; i < 8; i++) {
                const nIdx = neighborGrid[currIdx * 8 + i];
                if (nIdx === -1 || visited[nIdx] || isBlocked(nIdx)) continue;
                enqueue(nIdx);
            }
        }) === true
    );
}
