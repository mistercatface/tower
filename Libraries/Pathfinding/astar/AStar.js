import { MinHeap, IdxMinHeap } from "../../DataStructures/MinHeap.js";
import { OCTILE_OFFSETS, octileDistance } from "../../Spatial/grid/GridUtils.js";

const STALE_F_EPSILON = 1e-4;

export function runLocalAStarFlat(
    startCol, startRow, targetCol, targetRow,
    grid, cols, rows,
    maxPathLen, gScore, cameFrom, visited, runId,
) {
    const startIdx = startRow * cols + startCol;
    const targetIdx = targetRow * cols + targetCol;
    if (startIdx === targetIdx) {
        return [{ col: startCol, row: startRow }];
    }

    const openSet = new IdxMinHeap();

    gScore[startIdx] = 0;
    visited[startIdx] = runId;
    cameFrom[startIdx] = -1;

    openSet.push(startIdx, octileDistance(startCol, startRow, targetCol, targetRow));

    while (openSet.size > 0) {
        const curr = openSet.pop();
        const currIdx = curr.idx;
        const currCol = currIdx % cols;
        const currRow = (currIdx / cols) | 0;
        const currentG = gScore[currIdx];

        if (curr.f > currentG + octileDistance(currCol, currRow, targetCol, targetRow) + STALE_F_EPSILON) {
            continue;
        }
        if (currentG > maxPathLen) continue;

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

        for (const offset of OCTILE_OFFSETS) {
            const nc = currCol + offset.dc;
            const nr = currRow + offset.dr;

            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                const nIdx = nr * cols + nc;
                if (grid[nIdx] === 1) continue;

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
                    openSet.push(nIdx, tentativeG + octileDistance(nc, nr, targetCol, targetRow));
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
        f: octileDistance(startNode.col, startNode.row, targetNode.col, targetNode.row),
    });

    while (openSet.size > 0) {
        const curr = openSet.pop();
        const currentId = curr.id;
        const currentNode = nodesMap[currentId];
        const currentG = gScore[currentId];
        const bestF = currentG + octileDistance(
            currentNode.col, currentNode.row, targetNode.col, targetNode.row
        );

        if (curr.f > bestF + STALE_F_EPSILON) continue;

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

        for (const edge of currentNode.edges) {
            const neighborId = edge.targetId;
            const neighborNode = nodesMap[neighborId];
            if (!neighborNode) continue;

            const tentativeG = currentG + edge.cost;
            if (gScore[neighborId] === undefined || tentativeG < gScore[neighborId]) {
                cameFrom[neighborId] = currentId;
                gScore[neighborId] = tentativeG;
                openSet.push({
                    id: neighborId,
                    f: tentativeG + octileDistance(
                        neighborNode.col, neighborNode.row, targetNode.col, targetNode.row
                    ),
                });
            }
        }
    }

    return null;
}
