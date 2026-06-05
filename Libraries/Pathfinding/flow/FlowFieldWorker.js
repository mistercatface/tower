let GRID_WIDTH, GRID_SIZE;
let ObstacleGrid, NeighborGrid;
let FlowPool;

let bfsDistances;
let bfsQueue;

let localVectorMap;

self.onmessage = function(e) {
    const { type, data, slot, tx, ty, range } = e.data;
    if (type === 'init') {
        GRID_WIDTH = data.GRID_WIDTH;
        GRID_SIZE = data.GRID_SIZE;
        ObstacleGrid = new Uint8Array(data.sabObstacle);
        NeighborGrid = new Int32Array(data.sabNeighbors);
        FlowPool = new Uint8Array(data.sabFlowPool);
        bfsDistances = new Int32Array(GRID_SIZE);
        localVectorMap = new Uint8Array(GRID_SIZE);
        bfsQueue = new Int32Array(GRID_SIZE);
        return;
    }
    if (type === 'updateFlow') {
        const offset = slot * GRID_SIZE;
        const vectorMap = FlowPool.subarray(offset, offset + GRID_SIZE);
        computeFlowField(vectorMap, tx, ty, range);
    }
};

function computeFlowField(vectorMap, tx, ty, range) {
    bfsDistances.fill(-1);
    localVectorMap.fill(255);
    const startIdx = tx + ty * GRID_WIDTH;
    if (startIdx >= 0 && startIdx < GRID_SIZE && !ObstacleGrid[startIdx]) {
        localVectorMap[startIdx] = 4; // Center
        let head = 0, tail = 0;
        bfsDistances[startIdx] = 0;
        bfsQueue[tail++] = startIdx;
        while (head < tail) {
            const idx = bfsQueue[head++];
            const currentDist = bfsDistances[idx];
            if (currentDist >= range) continue;
            const cx = idx % GRID_WIDTH;
            const cy = (idx / GRID_WIDTH) | 0;
            const base = idx << 3; // idx * 8
            for (let i = 0; i < 8; i++) {
                const nIdx = NeighborGrid[base + i];
                if (nIdx !== -1 && bfsDistances[nIdx] === -1) {
                    // Check if obstacle
                    if (ObstacleGrid[nIdx] === 1) continue;
                    
                    // Corner cutting check (if diagonal)
                    const nx = nIdx % GRID_WIDTH;
                    const ny = (nIdx / GRID_WIDTH) | 0;
                    const dx = cx - nx;
                    const dy = cy - ny;
                    if (dx !== 0 && dy !== 0) {
                        const check1 = ObstacleGrid[cy * GRID_WIDTH + nx];
                        const check2 = ObstacleGrid[ny * GRID_WIDTH + cx];
                        if (check1 === 1 || check2 === 1) {
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
