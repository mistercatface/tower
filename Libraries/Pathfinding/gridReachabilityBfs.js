/**
 * Octile-grid BFS: can startIdx reach targetIdx without crossing blocked cells?
 *
 * @param {number} startIdx
 * @param {number} targetIdx
 * @param {Uint8Array} obstacleGrid — 0 walkable, 1 blocked
 * @param {Int32Array} neighborGrid — 8 neighbors per cell (-1 = none)
 * @param {number} gridWidth
 */
export function gridReachabilityBfs(startIdx, targetIdx, obstacleGrid, neighborGrid, gridWidth) {
    if (startIdx === targetIdx) return true;
    if (obstacleGrid[startIdx] === 1 || obstacleGrid[targetIdx] === 1) return false;

    const gridSize = obstacleGrid.length;
    const visited = new Uint8Array(gridSize);
    const queue = new Int32Array(gridSize);
    let head = 0;
    let tail = 0;

    queue[tail++] = startIdx;
    visited[startIdx] = 1;

    while (head < tail) {
        const currIdx = queue[head++];
        if (currIdx === targetIdx) return true;

        const currCol = currIdx % gridWidth;
        const currRow = (currIdx / gridWidth) | 0;

        for (let i = 0; i < 8; i++) {
            const nIdx = neighborGrid[currIdx * 8 + i];
            if (nIdx === -1 || visited[nIdx]) continue;
            if (obstacleGrid[nIdx] === 1) continue;

            const nc = nIdx % gridWidth;
            const nr = (nIdx / gridWidth) | 0;
            const dx = currCol - nc;
            const dy = currRow - nr;

            if (dx !== 0 && dy !== 0) {
                const check1 = obstacleGrid[currRow * gridWidth + nc];
                const check2 = obstacleGrid[nr * gridWidth + currCol];
                if (check1 === 1 || check2 === 1) continue;
            }

            visited[nIdx] = 1;
            queue[tail++] = nIdx;
        }
    }

    return false;
}
