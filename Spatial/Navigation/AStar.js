import {
    colRowToIndex,
    indexToColRow,
    forEachOctileNeighbor,
} from "./GridUtils.js";

export function runLocalAStarFlat(
    startCol, startRow, targetCol, targetRow,
    grid, cols, rows,
    maxPathLen, gScore, cameFrom, visited, runId
) {
    const startIdx = colRowToIndex(startCol, startRow, cols);
    const targetIdx = colRowToIndex(targetCol, targetRow, cols);
    if (startIdx === targetIdx) {
        return [{ col: startCol, row: startRow }];
    }

    const openSet = [startIdx];

    gScore[startIdx] = 0;
    visited[startIdx] = runId;
    cameFrom[startIdx] = -1;

    while (openSet.length > 0) {
        let lowestIdx = 0;
        let lowestF = Infinity;
        for (let i = 0; i < openSet.length; i++) {
            const idx = openSet[i];
            const { col: c, row: r } = indexToColRow(idx, cols);
            const f = gScore[idx] + Math.hypot(c - targetCol, r - targetRow);
            if (f < lowestF) {
                lowestF = f;
                lowestIdx = i;
            }
        }

        const currIdx = openSet[lowestIdx];
        openSet.splice(lowestIdx, 1);

        if (currIdx === targetIdx) {
            const path = [];
            let curr = currIdx;
            while (curr !== -1) {
                const { col, row } = indexToColRow(curr, cols);
                path.push({ col, row });
                curr = cameFrom[curr];
            }
            path.reverse();
            return path;
        }

        const { col: currCol, row: currRow } = indexToColRow(currIdx, cols);
        const currentG = gScore[currIdx];
        if (currentG > maxPathLen) continue;

        forEachOctileNeighbor(currCol, currRow, cols, rows, (nc, nr, nIdx, stepCost) => {
            if (grid[nIdx] === 1) return;

            if (nc !== currCol && nr !== currRow) {
                if (grid[colRowToIndex(nc, currRow, cols)] === 1 || grid[colRowToIndex(currCol, nr, cols)] === 1) {
                    return;
                }
            }

            const tentativeG = currentG + stepCost;

            if (visited[nIdx] !== runId || tentativeG < gScore[nIdx]) {
                visited[nIdx] = runId;
                gScore[nIdx] = tentativeG;
                cameFrom[nIdx] = currIdx;
                if (!openSet.includes(nIdx)) {
                    openSet.push(nIdx);
                }
            }
        });
    }
    return null;
}

export function runAbstractAStar(startNodeId, targetNodeId, nodesMap) {
    const startNode = nodesMap[startNodeId];
    const targetNode = nodesMap[targetNodeId];
    if (!startNode || !targetNode) return null;

    const openSet = new Set([startNodeId]);
    const cameFrom = {};

    const gScore = {};
    gScore[startNodeId] = 0;

    const fScore = {};
    fScore[startNodeId] = Math.hypot(startNode.col - targetNode.col, startNode.row - targetNode.row);

    const getLowestFScoreNode = () => {
        let lowest = null;
        let lowestVal = Infinity;
        for (const id of openSet) {
            if (fScore[id] < lowestVal) {
                lowestVal = fScore[id];
                lowest = id;
            }
        }
        return lowest;
    };

    while (openSet.size > 0) {
        const currentId = getLowestFScoreNode();
        if (currentId === targetNodeId) {
            const path = [];
            let curr = currentId;
            while (curr !== undefined) {
                path.push(nodesMap[curr]);
                curr = cameFrom[curr];
            }
            path.reverse();
            return path;
        }

        openSet.delete(currentId);
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
                fScore[neighborId] = tentativeG + Math.hypot(neighborNode.col - targetNode.col, neighborNode.row - targetNode.row);
                openSet.add(neighborId);
            }
        }
    }

    return null;
}
