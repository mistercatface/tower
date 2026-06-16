/**
 * Octile-grid BFS: can startIdx reach targetIdx without crossing blocked cells?
 *
 * @param {number} startIdx
 * @param {number} targetIdx
 * @param {(flowIdx: number) => boolean} isBlocked
 * @param {Int32Array} neighborGrid — 8 neighbors per cell (-1 = none)
 * @param {number} gridWidth
 */
export function gridReachabilityBfs(startIdx, targetIdx, isBlocked, neighborGrid, gridWidth) {
    if (startIdx === targetIdx) return !isBlocked(startIdx);
    if (isBlocked(startIdx) || isBlocked(targetIdx)) return false;
    const gridSize = neighborGrid.length >> 3;
    const visited = new Uint8Array(gridSize);
    const queue = new Int32Array(gridSize);
    let head = 0;
    let tail = 0;
    queue[tail++] = startIdx;
    visited[startIdx] = 1;
    while (head < tail) {
        const currIdx = queue[head++];
        if (currIdx === targetIdx) return true;
        for (let i = 0; i < 8; i++) {
            const nIdx = neighborGrid[currIdx * 8 + i];
            if (nIdx === -1 || visited[nIdx] || isBlocked(nIdx)) continue;
            visited[nIdx] = 1;
            queue[tail++] = nIdx;
        }
    }
    return false;
}
