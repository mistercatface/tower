export function bfsIndices(seeds, visit) {
    const queue = Array.isArray(seeds) ? seeds : [seeds];
    let head = 0;
    while (head < queue.length) {
        const idx = queue[head++];
        visit(idx, (nIdx) => {
            queue.push(nIdx);
        });
    }
    return queue;
}
export function bfsColRowQueue(queue, visit) {
    let head = 0;
    while (head < queue.length) {
        const col = queue[head++];
        const row = queue[head++];
        visit(col, row, (nc, nr) => {
            queue.push(nc, nr);
        });
    }
    return queue;
}
export function bfsTypedIndices(startIdx, gridSize, visit) {
    const visited = new Uint8Array(gridSize);
    const queue = new Int32Array(gridSize);
    let head = 0;
    let tail = 0;
    visited[startIdx] = 1;
    queue[tail++] = startIdx;
    while (head < tail) {
        const idx = queue[head++];
        const result = visit(idx, visited, (nIdx) => {
            visited[nIdx] = 1;
            queue[tail++] = nIdx;
        });
        if (result !== undefined) return result;
    }
}
