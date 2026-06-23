import { colRowToIndex, cellInRect } from "../Spatial/grid/GridUtils.js";
import { navIsBlocked, OCTILE_DIRS_PER_CELL, octileNeighborOffset } from "../Pathfinding/navTopologySab.js";
/** @typedef {import("./NavTopology.js").NavTopology} NavTopology */
/** @typedef {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} WorldObstacleGrid */
let distances = null;
let visitedGen = null;
let queue = null;
let cellCount = 0;
let visitGen = 1;
let horizonCols = 0;
let horizonRows = 0;
/** @type {WorldObstacleGrid | null} */
let horizonGrid = null;
let horizonReady = false;
/** @param {number} size */
function ensureScratch(size) {
    if (cellCount >= size && distances) return;
    distances = new Int32Array(size);
    visitedGen = new Uint32Array(size);
    queue = new Int32Array(size);
    cellCount = size;
}
/** @param {import("../Pathfinding/navTopologySab.js").NavTopology} topology @param {number} startIdx @param {number} maxSteps */
function runHorizonBfs(topology, startIdx, maxSteps) {
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
/**
 * Forward nav BFS from agent position into module scratch.
 * Look up with navReachStepsTo(worldX, worldY) — same pattern as draw pass sync + read.
 *
 * @param {NavTopology} navTopology
 * @param {number} startX
 * @param {number} startY
 * @param {number} maxSteps
 * @returns {boolean} false when topology not ready or start blocked
 */
export function syncNavReachHorizon(navTopology, startX, startY, maxSteps) {
    horizonReady = false;
    horizonGrid = null;
    if (!navTopology?.isReady?.()) return false;
    const frame = navTopology.frame;
    const topology = navTopology.topology;
    if (!frame || !topology) return false;
    const grid = navTopology.grid;
    const cols = frame.cols;
    const rows = frame.rows;
    ensureScratch(cols * rows);
    visitGen++;
    if (visitGen === 0xffffffff) {
        visitedGen.fill(0);
        visitGen = 1;
    }
    const startCol = grid.worldCol(startX);
    const startRow = grid.worldRow(startY);
    if (!cellInRect(startCol, startRow, cols, rows) || navIsBlocked(frame, topology, startCol, startRow)) return false;
    runHorizonBfs(topology, colRowToIndex(startCol, startRow, cols), maxSteps);
    horizonCols = cols;
    horizonRows = rows;
    horizonGrid = grid;
    horizonReady = true;
    return true;
}
/** Path steps from the last syncNavReachHorizon start, or null if unreachable within horizon. */
export function navReachStepsTo(worldX, worldY) {
    if (!horizonReady || !horizonGrid) return null;
    const col = horizonGrid.worldCol(worldX);
    const row = horizonGrid.worldRow(worldY);
    if (!cellInRect(col, row, horizonCols, horizonRows)) return null;
    const idx = colRowToIndex(col, row, horizonCols);
    if (visitedGen[idx] !== visitGen) return null;
    return distances[idx];
}
