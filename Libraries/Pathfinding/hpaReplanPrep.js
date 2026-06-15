/** @param {Int16Array | number[]} nodeCol @param {Int16Array | number[]} nodeRow @param {number} nodeCount @param {number} col @param {number} row */
export function nearestRegionNodeIdx(nodeCol, nodeRow, nodeCount, col, row) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < nodeCount; i++) {
        const d = Math.hypot(col - nodeCol[i], row - nodeRow[i]);
        if (d < bestD) {
            bestD = d;
            best = i;
        }
    }
    return best;
}
/**
 * @param {object} opts
 * @param {number} opts.gridCol
 * @param {number} opts.gridRow
 * @param {boolean} opts.isStart
 * @param {number} opts.anchorRegionIdx — region node index at start/target cell, or -1
 * @param {Int16Array} opts.nodeCol
 * @param {Int16Array} opts.nodeRow
 * @param {number} opts.nodeCount
 * @param {Int32Array} opts.edgeOffsets
 * @param {Int16Array} opts.edgeTargets
 * @param {number} opts.maxCellsPerChunk
 * @returns {number[]}
 */
export function collectPersistTempConnectCandidates({ gridCol, gridRow, isStart, anchorRegionIdx, nodeCol, nodeRow, nodeCount, edgeOffsets, edgeTargets, maxCellsPerChunk }) {
    const searchRadius = Math.ceil(Math.sqrt(maxCellsPerChunk)) * 2;
    const out = [];
    const seen = new Set();
    const add = (idx) => {
        if (idx < 0 || idx >= nodeCount || seen.has(idx)) return;
        seen.add(idx);
        out.push(idx);
    };
    if (anchorRegionIdx >= 0) {
        add(anchorRegionIdx);
        if (isStart) {
            const edgeStart = edgeOffsets[anchorRegionIdx];
            const edgeEnd = edgeOffsets[anchorRegionIdx + 1];
            for (let e = edgeStart; e < edgeEnd; e++) add(edgeTargets[e]);
        } else
            for (let i = 0; i < nodeCount; i++) {
                const edgeStart = edgeOffsets[i];
                const edgeEnd = edgeOffsets[i + 1];
                for (let e = edgeStart; e < edgeEnd; e++)
                    if (edgeTargets[e] === anchorRegionIdx) {
                        add(i);
                        break;
                    }
            }
        return out;
    }
    for (let i = 0; i < nodeCount; i++) {
        const d = Math.hypot(gridCol - nodeCol[i], gridRow - nodeRow[i]);
        if (d <= searchRadius) add(i);
    }
    return out;
}
