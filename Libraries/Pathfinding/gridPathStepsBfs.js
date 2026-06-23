import { OCTILE_NEIGHBOR_GRID_LAYOUT } from "./neighborGridLayout.js";
import { OCTILE_DIRS_PER_CELL, octileNeighborOffset } from "./navTopologySab.js";
/**
 * Forward BFS on an octile neighbor grid — returns path step count or null if unreachable within maxSteps.
 *
 * @param {object} params
 * @param {Int32Array} params.neighborGrid
 * @param {number} params.cellCount
 * @param {{ directionCount: number, cellOffset: (cellIdx: number, dirIdx: number) => number }} [params.neighborLayout]
 * @param {(idx: number) => boolean} params.isBlocked
 * @param {number} params.startIdx
 * @param {number} params.targetIdx
 * @param {number} params.maxSteps
 * @returns {number | null}
 */
export function gridPathStepsBfs({ neighborGrid, cellCount, neighborLayout = OCTILE_NEIGHBOR_GRID_LAYOUT, isBlocked, startIdx, targetIdx, maxSteps }) {
    if (startIdx === targetIdx) return isBlocked(startIdx) ? null : 0;
    if (isBlocked(startIdx) || isBlocked(targetIdx)) return null;
    let head = 0;
    let tail = 0;
    const visited = new Uint8Array(cellCount);
    const distances = new Int32Array(cellCount);
    const queue = new Int32Array(cellCount);
    visited[startIdx] = 1;
    distances[startIdx] = 0;
    queue[tail++] = startIdx;
    while (head < tail) {
        const idx = queue[head++];
        const step = distances[idx];
        if (idx === targetIdx) return step;
        if (step >= maxSteps) continue;
        for (let dir = 0; dir < neighborLayout.directionCount; dir++) {
            const nIdx = neighborGrid[neighborLayout.cellOffset(idx, dir)];
            if (nIdx === -1 || visited[nIdx] || isBlocked(nIdx)) continue;
            visited[nIdx] = 1;
            distances[nIdx] = step + 1;
            queue[tail++] = nIdx;
        }
    }
    return null;
}
/**
 * Fill path-step distances within maxSteps of startIdx on nav topology octile neighbors.
 *
 * @param {object} params
 * @param {import("./navTopologySab.js").NavTopology} params.topology
 * @param {number} params.startIdx
 * @param {number} params.maxSteps
 * @param {Int32Array} params.distances
 * @param {Uint32Array} params.visitedGen
 * @param {number} params.visitGen
 * @param {Int32Array} params.queue
 */
export function fillNavPathStepHorizon({ topology, startIdx, maxSteps, distances, visitedGen, visitGen, queue }) {
    const neighbors = topology.octileNeighbors;
    const blocked = topology.blocked;
    let head = 0;
    let tail = 0;
    visitedGen[startIdx] = visitGen;
    distances[startIdx] = 0;
    queue[tail++] = startIdx;
    while (head < tail) {
        const idx = queue[head++];
        const step = distances[idx];
        if (step >= maxSteps) continue;
        for (let dir = 0; dir < OCTILE_DIRS_PER_CELL; dir++) {
            const nIdx = neighbors[octileNeighborOffset(idx, dir)];
            if (nIdx < 0 || visitedGen[nIdx] === visitGen || blocked[nIdx]) continue;
            visitedGen[nIdx] = visitGen;
            distances[nIdx] = step + 1;
            queue[tail++] = nIdx;
        }
    }
}
