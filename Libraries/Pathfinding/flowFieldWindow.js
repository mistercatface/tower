import { snapshotWorldToGrid } from "./GridNavSnapshot.js";
export function rebuildFlowToNavIdx(flowToNavIdx, flowFrame, navFrame) {
    const flowSize = flowToNavIdx.length;
    const navCols = navFrame.cols;
    const navRows = navFrame.rows;
    const half = flowFrame.cellSize / 2;
    const wxBase = flowFrame.centerX - flowFrame.offsetX + half;
    const wyBase = flowFrame.centerY - flowFrame.offsetY + half;
    for (let idx = 0; idx < flowSize; idx++) {
        const col = idx % flowFrame.cols;
        const row = (idx / flowFrame.cols) | 0;
        const worldX = col * flowFrame.cellSize + wxBase;
        const worldY = row * flowFrame.cellSize + wyBase;
        const worldCell = snapshotWorldToGrid(navFrame, worldX, worldY);
        if (worldCell.col >= 0 && worldCell.col < navCols && worldCell.row >= 0 && worldCell.row < navRows) flowToNavIdx[idx] = worldCell.row * navCols + worldCell.col;
        else flowToNavIdx[idx] = -1;
    }
    return { navCols, navRows };
}
/** @param {Int32Array} flowToNavIdx @param {Int32Array} octilePredecessors @param {Int32Array} neighborGrid @param {number} flowSize @param {number} navCols @param {number} navRows */
export function rebuildFlowNeighborGrid(flowToNavIdx, octilePredecessors, neighborGrid, flowSize, navCols, navRows) {
    const navToFlow = new Int32Array(navCols * navRows).fill(-1);
    for (let idx = 0; idx < flowSize; idx++) {
        const navIdx = flowToNavIdx[idx];
        if (navIdx >= 0) navToFlow[navIdx] = idx;
    }
    for (let idx = 0; idx < flowSize; idx++) {
        const navIdx = flowToNavIdx[idx];
        const base = idx * 8;
        if (navIdx < 0) {
            for (let i = 0; i < 8; i++) neighborGrid[base + i] = -1;
            continue;
        }
        const navBase = navIdx * 8;
        for (let i = 0; i < 8; i++) {
            const navPredIdx = octilePredecessors[navBase + i];
            neighborGrid[base + i] = navPredIdx >= 0 ? navToFlow[navPredIdx] : -1;
        }
    }
}
/** @param {Int32Array} flowToNavIdx @param {Uint8Array} navBlocked @param {number} flowIdx */
export function flowCellBlocked(flowToNavIdx, navBlocked, flowIdx) {
    const navIdx = flowToNavIdx[flowIdx];
    return navIdx < 0 || navBlocked[navIdx] !== 0;
}
