import { snapshotWorldToGrid } from "./GridNavSnapshot.js";
/** @param {Int32Array} flowToNavIdx @param {number} flowCols @param {number} centerX @param {number} centerY @param {number} offsetX @param {number} offsetY @param {number} cellSize @param {import("./GridNavSnapshot.js").GridFrame} navFrame */
export function rebuildFlowToNavIdx(flowToNavIdx, flowCols, centerX, centerY, offsetX, offsetY, cellSize, navFrame) {
    const flowSize = flowToNavIdx.length;
    const navCols = navFrame.cols;
    const navRows = navFrame.rows;
    const half = cellSize / 2;
    const wxBase = centerX - offsetX + half;
    const wyBase = centerY - offsetY + half;
    for (let idx = 0; idx < flowSize; idx++) {
        const col = idx % flowCols;
        const row = (idx / flowCols) | 0;
        const worldX = col * cellSize + wxBase;
        const worldY = row * cellSize + wyBase;
        const worldCell = snapshotWorldToGrid(navFrame, worldX, worldY);
        if (worldCell.col >= 0 && worldCell.col < navCols && worldCell.row >= 0 && worldCell.row < navRows) flowToNavIdx[idx] = worldCell.row * navCols + worldCell.col;
        else flowToNavIdx[idx] = -1;
    }
    return { navCols, navRows };
}
/** @param {Int32Array} flowToNavIdx @param {Int32Array} octileNeighbors @param {Int32Array} neighborGrid @param {number} flowSize @param {number} navCols @param {number} navRows */
export function rebuildFlowNeighborGrid(flowToNavIdx, octileNeighbors, neighborGrid, flowSize, navCols, navRows) {
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
            const navNIdx = octileNeighbors[navBase + i];
            neighborGrid[base + i] = navNIdx >= 0 ? navToFlow[navNIdx] : -1;
        }
    }
}
/** @param {Int32Array} flowToNavIdx @param {Uint8Array} navBlocked @param {number} flowIdx */
export function flowCellBlocked(flowToNavIdx, navBlocked, flowIdx) {
    const navIdx = flowToNavIdx[flowIdx];
    return navIdx < 0 || navBlocked[navIdx] !== 0;
}
