import { addCorridorPathToOccupied } from "../../Pathfinding/Corridor/corridorLanePath.js";
import { buildCorridorBeltsFromPaths } from "../../RoomGraph/roomGraphCorridorBelts.js";
import { createSeededRng } from "../../Math/SeededRng.js";
import { forEachGlobalCellInMapGenBounds } from "../../Sandbox/mapGenBounds.js";
import { CARDINAL_OFFSETS, cellInRect, globalCellIdx, gridCellLayout, layoutAbsCellIndex, colRowToIndex } from "../../Spatial/grid/GridUtils.js";
import { floorBeltEntryExitSides, floorBeltRailEdgeSides } from "../../Spatial/grid/FloorCell.js";
import { isNavWalkableAt } from "./navWalkableIndex.js";
import { beltFootprintIndices, tryValidateBeltChains } from "./beltChainValidation.js";
import { collectPathMouthExteriorIndices, filterNavBeltEndpointCandidatesIdx, validateBeltPathMouthAccess } from "./railMazeBeltEndpoints.js";
import { createRailMazeNavCorridorPathfinder, findRailMazeNavCorridorPath } from "./railMazeNavCorridorPath.js";
const FULL_FOOTPRINT = { interiorOnly: false };
const DEFAULT_CORRIDOR_COUNT = 150;
const DEFAULT_PATH_LENGTH_MIN = 6;
const DEFAULT_PATH_LENGTH_MAX = 24;
const MAX_PAIR_ATTEMPTS_PER_CORRIDOR = 96;
const BELT_PLAN_SEED_SALT = 0xbe1a5afe;
const DEFAULT_OPEN_BELT_CHANCE = 0.1;
function manhattanCells(a, b) {
    return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}
function pathLengthInBand(path, minLen, maxLen) {
    return path.length >= minLen && path.length <= maxLen;
}
function navWalkableNeighborsIdx(grid, navTopology, idx) {
    const cols = grid.cols;
    const rows = grid.rows;
    const c = idx % cols;
    const r = (idx / cols) | 0;
    const out = [];
    if (c > 0) {
        const nIdx = idx - 1;
        if (grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology)) out.push(nIdx);
    }
    if (c + 1 < cols) {
        const nIdx = idx + 1;
        if (grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology)) out.push(nIdx);
    }
    if (r > 0) {
        const nIdx = idx - cols;
        if (grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology)) out.push(nIdx);
    }
    if (r + 1 < rows) {
        const nIdx = idx + cols;
        if (grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology)) out.push(nIdx);
    }
    return out;
}
/** @param {import("./navWalkableIndex.js").NavWalkableIndex} navWalkableIndex */
export function collectRailMazeBeltZoneCells(grid, navTopology, railConfig, navWalkableIndex) {
    const cellSize = grid.cellSize;
    const beltStartGlobalRow = railConfig.boundsRow;
    const cells = [];
    forEachGlobalCellInMapGenBounds(railConfig, (globalCol, globalRow) => {
        if (globalRow < beltStartGlobalRow) return;
        const col = grid.worldCol(globalCol * cellSize);
        const row = grid.worldRow(globalRow * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) return;
        const idx = col + row * grid.cols;
        if (!isNavWalkableAt(navWalkableIndex, idx)) return;
        cells.push({ col, row, globalCol, globalRow });
    });
    return cells;
}
function degreeInZone(cells, neighborAtIdx, gridCols) {
    const memberSet = new Set();
    for (let i = 0; i < cells.length; i++) memberSet.add(colRowToIndex(cells[i].col, cells[i].row, gridCols));
    const degreeByIndex = new Map();
    for (let i = 0; i < cells.length; i++) {
        const idx = colRowToIndex(cells[i].col, cells[i].row, gridCols);
        const neighbors = neighborAtIdx(idx).filter((nIdx) => memberSet.has(nIdx));
        degreeByIndex.set(idx, neighbors.length);
    }
    return degreeByIndex;
}
function peelBrokenBelts(floorBelts, mouthExteriorIndices, layout) {
    let belts = floorBelts.slice();
    const stride = layout.strideCols;
    const stepSide = (idx, side) => {
        if (side === 0) return idx - stride;
        if (side === 1) return idx + 1;
        if (side === 2) return idx + stride;
        if (side === 3) return idx - 1;
        return idx;
    };
    for (let pass = 0; pass < belts.length + 4; pass++) {
        const validation = tryValidateBeltChains(belts, layout, mouthExteriorIndices);
        if (validation.ok) return { floorBelts: belts, validation };
        const footprint = validation.footprint;
        const byCell = validation.beltsByCell;
        const removeIndices = new Set();
        for (const idx of footprint) {
            const belt = byCell.get(idx);
            const { entrySide, exitSide } = floorBeltEntryExitSides(belt.kind, belt.facingIndex);
            const entryIdx = stepSide(belt.idx, entrySide);
            const exitIdx = stepSide(belt.idx, exitSide);
            const entryInFootprint = footprint.has(entryIdx);
            const exitInFootprint = footprint.has(exitIdx);
            if (!entryInFootprint && !exitInFootprint && !mouthExteriorIndices.has(idx)) removeIndices.add(idx);
            if (entryInFootprint) {
                const entryBelt = byCell.get(entryIdx);
                const entryExit = floorBeltEntryExitSides(entryBelt.kind, entryBelt.facingIndex).exitSide;
                if (entryExit !== (entrySide + 2) % 4) removeIndices.add(idx);
            }
            if (exitInFootprint) {
                const exitBelt = byCell.get(exitIdx);
                const exitEntry = floorBeltEntryExitSides(exitBelt.kind, exitBelt.facingIndex).entrySide;
                if (exitEntry !== (exitSide + 2) % 4) removeIndices.add(idx);
            }
        }
        if (removeIndices.size === 0) return { floorBelts: belts, validation };
        belts = belts.filter((belt) => !removeIndices.has(belt.idx));
        if (belts.length === 0) return { floorBelts: belts, validation: tryValidateBeltChains(belts, layout, mouthExteriorIndices) };
    }
    return { floorBelts: belts, validation: tryValidateBeltChains(belts, layout, mouthExteriorIndices) };
}
function pickRandomFreeIdx(freeIndices, occupiedGlobalIndices, rng) {
    if (freeIndices.length < 2) return -1;
    for (let attempt = 0; attempt < freeIndices.length; attempt++) {
        const idx = freeIndices[Math.floor(rng() * freeIndices.length)];
        if (!occupiedGlobalIndices.has(idx)) return idx;
    }
    return -1;
}
function pickRandomEndInLengthBandIdx(startIdx, endpointIndices, occupiedGlobalIndices, gridCols, minLen, maxLen, rng) {
    const candidates = [];
    const sc = startIdx % gridCols;
    const sr = (startIdx / gridCols) | 0;
    for (let i = 0; i < endpointIndices.length; i++) {
        const idx = endpointIndices[i];
        if (idx === startIdx) continue;
        if (occupiedGlobalIndices.has(idx)) continue;
        const ec = idx % gridCols;
        const er = (idx / gridCols) | 0;
        const dist = Math.abs(sc - ec) + Math.abs(sr - er);
        if (dist < minLen || dist > maxLen) continue;
        candidates.push(idx);
    }
    if (!candidates.length) return pickRandomFreeIdx(endpointIndices, occupiedGlobalIndices, rng);
    return candidates[Math.floor(rng() * candidates.length)];
}
function planRandomNavCorridorPaths({ grid, navTopology, railConfig, zoneCells, navWalkableIndex, corridorCount, corridorWidth, pathLengthMin, pathLengthMax, rng }) {
    const globalLayout = gridCellLayout(grid);
    const cols = grid.cols;
    const endpointIndices = filterNavBeltEndpointCandidatesIdx(
        grid,
        navTopology,
        zoneCells.map((cell) => cell.col + cell.row * cols),
    );
    const pathfinder = createRailMazeNavCorridorPathfinder(grid, navTopology, railConfig, navWalkableIndex);
    /** @type {Set<import("../../Spatial/grid/GridUtils.js").GlobalCellIdx>} */
    const occupiedGlobalIndices = new Set();
    /** @type {{ c: number, r: number }[][]} */
    const paths = [];
    /** @type {number[]} */
    const widths = [];
    for (let placed = 0; placed < corridorCount; placed++) {
        let placedPath = null;
        for (let attempt = 0; attempt < MAX_PAIR_ATTEMPTS_PER_CORRIDOR; attempt++) {
            const startIdx = pickRandomFreeIdx(endpointIndices, occupiedGlobalIndices, rng);
            if (startIdx === -1) break;
            const endIdx = pickRandomEndInLengthBandIdx(startIdx, endpointIndices, occupiedGlobalIndices, cols, pathLengthMin, pathLengthMax, rng);
            if (endIdx === -1) break;
            if (startIdx === endIdx) continue;
            const path = findRailMazeNavCorridorPath(pathfinder, startIdx, endIdx, occupiedGlobalIndices, corridorWidth, pathLengthMax);
            if (!path) continue;
            if (!pathLengthInBand(path, pathLengthMin, pathLengthMax)) continue;
            if (!validateBeltPathMouthAccess(grid, navTopology, path, occupiedGlobalIndices)) continue;
            placedPath = path;
            break;
        }
        if (!placedPath) break;
        paths.push(placedPath);
        widths.push(corridorWidth);
        addCorridorPathToOccupied(placedPath, occupiedGlobalIndices, corridorWidth, globalLayout, FULL_FOOTPRINT);
    }
    return { paths, widths };
}
export function planRailMazeCorridorBelts({
    grid,
    navTopology,
    railConfig,
    navWalkableIndex,
    corridorCount = DEFAULT_CORRIDOR_COUNT,
    corridorWidth = 1,
    pathLengthMin = DEFAULT_PATH_LENGTH_MIN,
    pathLengthMax = DEFAULT_PATH_LENGTH_MAX,
    mapSeed = 0,
    rng = null,
}) {
    const globalLayout = gridCellLayout(grid);
    const zoneCells = collectRailMazeBeltZoneCells(grid, navTopology, railConfig, navWalkableIndex);
    const random = rng ?? createSeededRng((mapSeed ^ BELT_PLAN_SEED_SALT) >>> 0);
    const { paths, widths } = planRandomNavCorridorPaths({ grid, navTopology, railConfig, zoneCells, navWalkableIndex, corridorCount, corridorWidth, pathLengthMin, pathLengthMax, rng: random });
    const neighborAtIdx = (idx) => navWalkableNeighborsIdx(grid, navTopology, idx);
    const degreeByIndex = degreeInZone(zoneCells, neighborAtIdx, grid.cols);
    let floorBelts = buildCorridorBeltsFromPaths(paths, widths, [], null, null, globalLayout);
    const footprint = beltFootprintIndices(floorBelts, globalLayout);
    const mouthExteriorIndices = new Set(collectPathMouthExteriorIndices(paths, grid));
    const peeled = peelBrokenBelts(floorBelts, mouthExteriorIndices, globalLayout);
    floorBelts = peeled.floorBelts;
    const validation = peeled.validation;
    // Generate beltRails on the lateral edges of each floor belt
    const beltRails = [];
    const globalCoordsByLocalIdx = new Map();
    for (let i = 0; i < zoneCells.length; i++) {
        const cell = zoneCells[i];
        const idx = cell.col + cell.row * grid.cols;
        globalCoordsByLocalIdx.set(idx, { globalCol: cell.globalCol, globalRow: cell.globalRow });
    }
    const cols = grid.cols;
    const heightLevel = railConfig.wallHeightLevel ?? 1;
    const thicknessLevel = railConfig.edgeThickness ?? 1;
    for (let i = 0; i < floorBelts.length; i++) {
        const belt = floorBelts[i];
        const globalCoords = globalCoordsByLocalIdx.get(belt.idx);
        if (!globalCoords) continue;
        // Get the lateral rail sides for this belt kind and facing
        const sides = floorBeltRailEdgeSides(belt.kind, belt.facingIndex);
        for (let s = 0; s < sides.length; s++) beltRails.push({ col: globalCoords.globalCol, row: globalCoords.globalRow, side: sides[s], heightLevel, thicknessLevel });
    }
    return { floorBelts, paths, zoneCellCount: zoneCells.length, pathCount: paths.length, mouthExteriorIndices, validation, degreeByIndex, beltRails };
}
export function planRailMazeCorridorBeltsFromPreview(preview) {
    return planRailMazeCorridorBelts({
        grid: preview.grid,
        navTopology: preview.navTopology,
        railConfig: preview.railConfig,
        navWalkableIndex: preview.navWalkableIndex,
        mapSeed: preview.layout.mapSeed,
    });
}
