import { MinHeap } from "../../Core/MinHeap.js";

const OCTILE_OFFSETS = [
    { dc: 0, dr: -1, cost: 1 },
    { dc: 1, dr: 0, cost: 1 },
    { dc: 0, dr: 1, cost: 1 },
    { dc: -1, dr: 0, cost: 1 },
    { dc: 1, dr: -1, cost: 1.41421356 },
    { dc: 1, dr: 1, cost: 1.41421356 },
    { dc: -1, dr: 1, cost: 1.41421356 },
    { dc: -1, dr: -1, cost: 1.41421356 },
];

export function runLocalAStarFlat(
    startCol, startRow, targetCol, targetRow,
    grid, cols, rows,
    maxPathLen, gScore, cameFrom, visited, runId
) {
    const startIdx = startRow * cols + startCol;
    const targetIdx = targetRow * cols + targetCol;
    if (startIdx === targetIdx) {
        return [{ col: startCol, row: startRow }];
    }

    const openSet = new MinHeap((a, b) => a.f - b.f);

    gScore[startIdx] = 0;
    visited[startIdx] = runId;
    cameFrom[startIdx] = -1;

    openSet.push({ idx: startIdx, f: Math.sqrt((startCol - targetCol) ** 2 + (startRow - targetRow) ** 2) });

    while (openSet.size > 0) {
        const curr = openSet.pop();
        const currIdx = curr.idx;

        if (currIdx === targetIdx) {
            const path = [];
            let currNode = currIdx;
            while (currNode !== -1) {
                path.push({ col: currNode % cols, row: (currNode / cols) | 0 });
                currNode = cameFrom[currNode];
            }
            path.reverse();
            return path;
        }

        const currCol = currIdx % cols;
        const currRow = (currIdx / cols) | 0;
        const currentG = gScore[currIdx];
        if (currentG > maxPathLen) continue;

        for (let i = 0; i < 8; i++) {
            const offset = OCTILE_OFFSETS[i];
            const nc = currCol + offset.dc;
            const nr = currRow + offset.dr;

            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                const nIdx = nr * cols + nc;
                if (grid[nIdx] === 1) continue;

                // Corner cutting checks
                if (offset.dc !== 0 && offset.dr !== 0) {
                    if (grid[nr * cols + currCol] === 1 || grid[currRow * cols + nc] === 1) {
                        continue;
                    }
                }

                const tentativeG = currentG + offset.cost;

                if (visited[nIdx] !== runId || tentativeG < gScore[nIdx]) {
                    visited[nIdx] = runId;
                    gScore[nIdx] = tentativeG;
                    cameFrom[nIdx] = currIdx;

                    const h = Math.sqrt((nc - targetCol) ** 2 + (nr - targetRow) ** 2);
                    openSet.push({ idx: nIdx, f: tentativeG + h });
                }
            }
        }
    }
    return null;
}

export function runAbstractAStar(startNodeId, targetNodeId, nodesMap) {
    const startNode = nodesMap[startNodeId];
    const targetNode = nodesMap[targetNodeId];
    if (!startNode || !targetNode) return null;

    const openSet = new MinHeap((a, b) => a.f - b.f);
    const cameFrom = {};

    const gScore = {};
    gScore[startNodeId] = 0;

    openSet.push({
        id: startNodeId,
        f: Math.sqrt((startNode.col - targetNode.col) ** 2 + (startNode.row - targetNode.row) ** 2)
    });

    while (openSet.size > 0) {
        const curr = openSet.pop();
        const currentId = curr.id;

        if (currentId === targetNodeId) {
            const path = [];
            let currNodeId = currentId;
            while (currNodeId !== undefined) {
                path.push(nodesMap[currNodeId]);
                currNodeId = cameFrom[currNodeId];
            }
            path.reverse();
            return path;
        }

        const currentNode = nodesMap[currentId];
        const currentG = gScore[currentId];

        for (const edge of currentNode.edges) {
            const neighborId = edge.targetId;
            const neighborNode = nodesMap[neighborId];
            if (!neighborNode) continue;

            const tentativeG = currentG + edge.cost;
            if (gScore[neighborId] === undefined || tentativeG < gScore[neighborId]) {
                cameFrom[neighborId] = currentId;
                gScore[neighborId] = tentativeG;

                const h = Math.sqrt((neighborNode.col - targetNode.col) ** 2 + (neighborNode.row - targetNode.row) ** 2);
                openSet.push({ id: neighborId, f: tentativeG + h });
            }
        }
    }

    return null;
}
