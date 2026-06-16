import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function findNearestOpenCell(grid, col, row) {
    if (!grid.isBlocked(col, row)) return { col, row };
    for (let r = 1; r <= 5; r++)
        for (let dr = -r; dr <= r; dr++)
            for (let dc = -r; dc <= r; dc++) {
                const nc = col + dc;
                const nr = row + dr;
                if (nc >= 0 && nc < grid.cols && nr >= 0 && nr < grid.rows && !grid.isBlocked(nc, nr)) return { col: nc, row: nr };
            }
    return { col, row };
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} startX
 * @param {number} startY
 * @param {number} targetX
 * @param {number} targetY
 */
export function resolveSnappedPathEndpoints(grid, startX, startY, targetX, targetY) {
    const startGrid = grid.worldToGrid(startX, startY);
    const targetGrid = grid.worldToGrid(targetX, targetY);
    let startCol = Math.max(0, Math.min(grid.cols - 1, startGrid.col));
    let startRow = Math.max(0, Math.min(grid.rows - 1, startGrid.row));
    let targetCol = Math.max(0, Math.min(grid.cols - 1, targetGrid.col));
    let targetRow = Math.max(0, Math.min(grid.rows - 1, targetGrid.row));
    const startOpen = findNearestOpenCell(grid, startCol, startRow);
    startCol = startOpen.col;
    startRow = startOpen.row;
    const targetOpen = findNearestOpenCell(grid, targetCol, targetRow);
    targetCol = targetOpen.col;
    targetRow = targetOpen.row;
    if (grid.snapPathTargetCell) {
        const snapped = grid.snapPathTargetCell(startCol, startRow, targetCol, targetRow);
        targetCol = snapped.col;
        targetRow = snapped.row;
    }
    return { startCol, startRow, targetCol, targetRow };
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {ReturnType<import("./HpaPathWorker.js").HpaPathWorker["getGraphMeta"]>} graphMeta
 * @param {Int16Array} cellToRegion
 * @param {number} startCol
 * @param {number} startRow
 * @param {number} targetCol
 * @param {number} targetRow
 */
export function prepareHpaReplanPrep(grid, graphMeta, cellToRegion, startCol, startRow, targetCol, targetRow) {
    const cols = grid.cols;
    const startIdx = colRowToIndex(startCol, startRow, cols);
    const targetIdx = colRowToIndex(targetCol, targetRow, cols);
    const startRegion = cellToRegion[startIdx];
    const targetRegion = cellToRegion[targetIdx];
    const cellDist = Math.hypot(startCol - targetCol, startRow - targetRow);
    if (cellDist < 32 || (startRegion >= 0 && startRegion === targetRegion)) return { mode: "local", startCol, startRow, targetCol, targetRow };
    const { nodeIds, nodeCol, nodeRow } = graphMeta;
    return { mode: "hpa", startCol, startRow, targetCol, targetRow, nodeCount: graphMeta.nodeCount, nodeIds, nodeCol, nodeRow, regionConnectMaxLen: 96 };
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {object} prep
 * @param {number[]} abstractIdx
 * @param {number} pathLen
 */
export function buildHpaReplanResult(grid, prep, abstractIdx, pathLen) {
    if (prep.mode === "local") {
        if (pathLen <= 0) return null;
        const abstractNodes = buildHpaAbstractNodes(grid, prep, abstractIdx);
        return { pathLen, abstractNodes, pathPlanner: "local" };
    }
    const abstractNodes = buildHpaAbstractNodes(grid, prep, abstractIdx);
    if (!abstractNodes) return null;
    if (pathLen <= 0) return { pathLen: 0, abstractNodes, pathPlanner: "hpa" };
    return { pathLen, abstractNodes, pathPlanner: "hpa" };
}
export function buildHpaAbstractNodes(grid, prep, abstractIdx) {
    if (prep.mode === "local") {
        const startWorld = grid.gridToWorld(prep.startCol, prep.startRow);
        const targetWorld = grid.gridToWorld(prep.targetCol, prep.targetRow);
        return [
            { x: startWorld.x, y: startWorld.y, id: "start" },
            { x: targetWorld.x, y: targetWorld.y, id: "target" },
        ];
    }
    if (!abstractIdx.length) return null;
    const { nodeCol, nodeRow, startCol, startRow, targetCol, targetRow, nodeIds, nodeCount } = prep;
    const startTemp = nodeCount;
    const targetTemp = nodeCount + 1;
    return abstractIdx.map((idx) => {
        if (idx === startTemp) return { ...grid.gridToWorld(startCol, startRow), id: "start" };
        if (idx === targetTemp) return { ...grid.gridToWorld(targetCol, targetRow), id: "target" };
        return { ...grid.gridToWorld(nodeCol[idx], nodeRow[idx]), id: nodeIds[idx] };
    });
}
