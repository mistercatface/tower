export class SharedEdgeSolver {
    /**
     * @param {Float32Array} wallsData - Buffer with layout [x, y, angle, size, isDead]
     * @param {Uint8Array} sharedEdgesOut - Output buffer, 1 byte per wall (4 bits for 4 edges)
     * @param {number} numWalls - Number of walls currently active in the buffers
     */
    static solve(wallsData, sharedEdgesOut, numWalls) {
        const activeEdges = [];
        const STRIDE = 5;

        for (let i = 0; i < numWalls; i++) {
            const offset = i * STRIDE;
            const isDead = wallsData[offset + 4] !== 0;
            sharedEdgesOut[i] = 0; // reset flags

            if (isDead) continue;

            const x = wallsData[offset];
            const y = wallsData[offset + 1];
            const angle = wallsData[offset + 2];
            const size = wallsData[offset + 3];

            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const hs = size / 2;

            const c0x = x - hs * cos + hs * sin;
            const c0y = y - hs * sin - hs * cos;
            const c1x = x + hs * cos + hs * sin;
            const c1y = y + hs * sin - hs * cos;
            const c2x = x + hs * cos - hs * sin;
            const c2y = y + hs * sin + hs * cos;
            const c3x = x - hs * cos - hs * sin;
            const c3y = y - hs * sin + hs * cos;

            const edges = [
                { p1x: c0x, p1y: c0y, p2x: c1x, p2y: c1y },
                { p1x: c1x, p1y: c1y, p2x: c2x, p2y: c2y },
                { p1x: c2x, p1y: c2y, p2x: c3x, p2y: c3y },
                { p1x: c3x, p1y: c3y, p2x: c0x, p2y: c0y },
            ];

            for (let e = 0; e < 4; e++) {
                const ex = (edges[e].p1x + edges[e].p2x) / 2;
                const ey = (edges[e].p1y + edges[e].p2y) / 2;
                activeEdges.push({
                    wallId: i,
                    edgeIndex: e,
                    cx: ex,
                    cy: ey
                });
            }
        }

        const grid = new Map();
        const cellSize = 5;
        const getBucketKey = (x, y) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;

        for (let i = 0; i < activeEdges.length; i++) {
            const edge = activeEdges[i];
            const key = getBucketKey(edge.cx, edge.cy);
            let bucket = grid.get(key);
            if (!bucket) {
                bucket = [];
                grid.set(key, bucket);
            }
            bucket.push(edge);
        }

        const thresholdSq = 9.0;
        for (let i = 0; i < activeEdges.length; i++) {
            const e1 = activeEdges[i];
            
            const currentFlags = sharedEdgesOut[e1.wallId];
            const isShared = (currentFlags & (1 << e1.edgeIndex)) !== 0;
            if (isShared) continue;

            const col = Math.floor(e1.cx / cellSize);
            const row = Math.floor(e1.cy / cellSize);
            let found = false;

            for (let r = -1; r <= 1 && !found; r++) {
                for (let c = -1; c <= 1 && !found; c++) {
                    const key = `${col + c},${row + r}`;
                    const bucket = grid.get(key);
                    if (!bucket) continue;

                    for (let j = 0; j < bucket.length; j++) {
                        const e2 = bucket[j];
                        if (e1.wallId === e2.wallId && e1.edgeIndex === e2.edgeIndex) continue;

                        const distSq = (e1.cx - e2.cx) ** 2 + (e1.cy - e2.cy) ** 2;
                        if (distSq < thresholdSq) {
                            sharedEdgesOut[e1.wallId] |= (1 << e1.edgeIndex);
                            sharedEdgesOut[e2.wallId] |= (1 << e2.edgeIndex);
                            found = true;
                            break;
                        }
                    }
                }
            }
        }
    }
}
