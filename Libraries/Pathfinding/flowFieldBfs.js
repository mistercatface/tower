/**
 * BFS flow-field on octile neighbor grid. Pure buffer math for worker or main thread.
 *
 * @param {Uint8Array} vectorMap — output slice (length = gridSize)
 * @param {object} params
 * @param {number} params.gridWidth
 * @param {number} params.gridSize
 * @param {Uint8Array} params.obstacleGrid — 0 walkable, 1 blocked
 * @param {Int32Array} params.neighborGrid — 8 neighbors per cell (-1 = none)
 * @param {number} params.tx — target col
 * @param {number} params.ty — target row
 * @param {number} params.range
 * @param {Int32Array} params.bfsDistances — scratch, length gridSize
 * @param {Int32Array} params.bfsQueue — scratch, length gridSize
 * @param {Uint8Array} params.localVectorMap — scratch, length gridSize
 */
export function computeFlowField(vectorMap, {
    gridWidth,
    gridSize,
    obstacleGrid,
    neighborGrid,
    tx,
    ty,
    range,
    bfsDistances,
    bfsQueue,
    localVectorMap,
}) {
    bfsDistances.fill(-1);
    localVectorMap.fill(255);
    const startIdx = tx + ty * gridWidth;
    if (startIdx >= 0 && startIdx < gridSize && !obstacleGrid[startIdx]) {
        localVectorMap[startIdx] = 4;
        let head = 0;
        let tail = 0;
        bfsDistances[startIdx] = 0;
        bfsQueue[tail++] = startIdx;
        while (head < tail) {
            const idx = bfsQueue[head++];
            const currentDist = bfsDistances[idx];
            if (currentDist >= range) continue;
            const cx = idx % gridWidth;
            const cy = (idx / gridWidth) | 0;
            const base = idx << 3;
            for (let i = 0; i < 8; i++) {
                const nIdx = neighborGrid[base + i];
                if (nIdx !== -1 && bfsDistances[nIdx] === -1) {
                    if (obstacleGrid[nIdx]) continue;

                    const nx = nIdx % gridWidth;
                    const ny = (nIdx / gridWidth) | 0;
                    const dx = cx - nx;
                    const dy = cy - ny;
                    if (dx !== 0 && dy !== 0) {
                        const check1 = obstacleGrid[cy * gridWidth + nx];
                        const check2 = obstacleGrid[ny * gridWidth + cx];
                        if (check1 || check2) {
                            continue;
                        }
                    }

                    bfsDistances[nIdx] = currentDist + 1;
                    bfsQueue[tail++] = nIdx;
                    localVectorMap[nIdx] = (dx + 1) + (dy + 1) * 3;
                }
            }
        }
    }
    vectorMap.set(localVectorMap);
}
