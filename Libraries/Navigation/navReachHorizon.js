import { colRowToIndex, cellInRect } from "../Spatial/grid/GridUtils.js";
import { fillNavPathStepHorizon } from "../Pathfinding/gridPathStepsBfs.js";
import { navIsBlocked } from "../Pathfinding/navTopologySab.js";
import { gridNavCacheKey } from "../Spatial/grid/gridNavEpoch.js";
/** @typedef {import("./NavTopology.js").NavTopology} NavTopology */
let scratchDistances = null;
let scratchVisitedGen = null;
let scratchQueue = null;
let scratchCellCount = 0;
let visitGeneration = 1;
/** @param {number} cellCount */
function ensureScratch(cellCount) {
    if (scratchCellCount >= cellCount && scratchDistances) return;
    scratchDistances = new Int32Array(cellCount);
    scratchVisitedGen = new Uint32Array(cellCount);
    scratchQueue = new Int32Array(cellCount);
    scratchCellCount = cellCount;
}
/** @param {NavTopology} navTopology */
function navTopologyKey(navTopology) {
    const grid = navTopology.grid;
    if (!grid) return "";
    return `${gridNavCacheKey(grid)}:${grid.cols}x${grid.rows}`;
}
/**
 * Sync forward nav BFS from an agent position, capped at maxSteps.
 * One BFS per call — use stepsTo() for multiple target lookups within the horizon.
 *
 * @param {NavTopology} navTopology
 * @param {number} startX
 * @param {number} startY
 * @param {number} maxSteps
 * @returns {{ stepsTo(x: number, y: number): number | null, topologyKey: string }}
 */
export function buildNavReachHorizon(navTopology, startX, startY, maxSteps) {
    const empty = { stepsTo: () => null, topologyKey: navTopologyKey(navTopology) };
    if (!navTopology?.isReady?.()) return empty;
    const frame = navTopology.frame;
    const topology = navTopology.topology;
    if (!frame || !topology) return empty;
    const grid = navTopology.grid;
    const cols = frame.cols;
    const rows = frame.rows;
    const cellCount = cols * rows;
    ensureScratch(cellCount);
    visitGeneration++;
    if (visitGeneration === 0xffffffff) {
        scratchVisitedGen.fill(0);
        visitGeneration = 1;
    }
    const startCol = grid.worldCol(startX);
    const startRow = grid.worldRow(startY);
    if (!cellInRect(startCol, startRow, cols, rows) || navIsBlocked(frame, topology, startCol, startRow)) return empty;
    const startIdx = colRowToIndex(startCol, startRow, cols);
    fillNavPathStepHorizon({ topology, startIdx, maxSteps, distances: scratchDistances, visitedGen: scratchVisitedGen, visitGen: visitGeneration, queue: scratchQueue });
    const topologyKey = navTopologyKey(navTopology);
    return {
        topologyKey,
        stepsTo(x, y) {
            const col = grid.worldCol(x);
            const row = grid.worldRow(y);
            if (!cellInRect(col, row, cols, rows)) return null;
            const idx = colRowToIndex(col, row, cols);
            if (scratchVisitedGen[idx] !== visitGeneration) return null;
            return scratchDistances[idx];
        },
    };
}
