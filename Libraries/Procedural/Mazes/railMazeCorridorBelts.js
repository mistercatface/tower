import { addCorridorPathToOccupied, buildCorridorBeltsFromPaths } from "./railMazeCorridorFootprint.js";
import { createSeededRng } from "../../Math/math.js";
import { forEachGlobalCellInMapGenBounds } from "../../Sandbox/mapGenBounds.js";
import { CARDINAL_OFFSETS } from "../../Math/math.js";
import { cellInRect, gridCellLayout, layoutAbsCellIndex, forEachCardinalNeighborIdx } from "../../Spatial/spatial.js";;
import {  edgeMirrorSide, edgeNeighborIdx  } from "../../Spatial/spatial.js";
import {  FloorBelt  } from "../../Spatial/spatial.js";
import { gridSettings } from "../../../Config/world.js";
import { stampRailWallsQuiet } from "../../Sandbox/gridWallEdit.js";
import { commitGridNavEdit } from "../../Sandbox/gridNavEdit.js";
import { cellBoundsAtIdx, unionCellBounds } from "../../DataStructures/CellRect.js";
import { isNavWalkableAt } from "./walkableCells.js";
import { beltFootprintIndices, tryValidateBeltChains } from "./beltChainValidation.js";
import { createNavGraphViewFromTopology } from "../../Navigation/navGraph.js";
import {  gridSideFromCellIdxToNeighborIdx  } from "../../Spatial/spatial.js";
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
    const out = [];
    forEachCardinalNeighborIdx(idx, grid.cols, grid.rows, (nIdx) => {
        if (grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology)) out.push(nIdx);
    });
    return out;
}
/** @param {import("./navWalkableIndex.js").NavWalkableIndex} navWalkableIndex */
export function collectRailMazeBeltZoneCells(grid, navTopology, railConfig, navWalkableIndex) {
    const cellSize = grid.cellSize;
    const colOffset = Math.round(grid.minX / cellSize);
    const rowOffset = Math.round(grid.minY / cellSize);
    const localBoundsRow = (railConfig.boundsIdx / grid.cols) | 0;
    const beltStartGlobalRow = localBoundsRow + rowOffset;
    const cells = [];
    forEachGlobalCellInMapGenBounds(grid, railConfig, (idx) => {
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        const globalCol = col + colOffset;
        const globalRow = row + rowOffset;
        if (globalRow < beltStartGlobalRow) return;
        if (!isNavWalkableAt(navWalkableIndex, idx)) return;
        cells.push({ idx, globalCol, globalRow });
    });
    return cells;
}
function degreeInZone(cells, neighborAtIdx) {
    const memberSet = new Set();
    for (let i = 0; i < cells.length; i++) memberSet.add(cells[i].idx);
    const degreeByIndex = new Map();
    for (let i = 0; i < cells.length; i++) {
        const idx = cells[i].idx;
        const neighbors = neighborAtIdx(idx).filter((nIdx) => memberSet.has(nIdx));
        degreeByIndex.set(idx, neighbors.length);
    }
    return degreeByIndex;
}
function peelBrokenBelts(floorBelts, mouthExteriorIndices, layout) {
    let belts = floorBelts.slice();
    const stride = layout.strideCols;
    const rows = layout.cellCount / stride;
    for (let pass = 0; pass < belts.length + 4; pass++) {
        const validation = tryValidateBeltChains(belts, layout, mouthExteriorIndices);
        if (validation.ok) return { floorBelts: belts, validation };
        const footprint = validation.footprint;
        const byCell = validation.beltsByCell;
        const removeIndices = new Set();
        for (const idx of footprint) {
            const belt = byCell.get(idx);
            const { entrySide, exitSide } = FloorBelt.getEntryExitSides(belt.kind, belt.facingIndex);
            const entryIdx = edgeNeighborIdx(belt.idx, entrySide, stride, rows);
            const exitIdx = edgeNeighborIdx(belt.idx, exitSide, stride, rows);
            const entryInFootprint = footprint.has(entryIdx);
            const exitInFootprint = footprint.has(exitIdx);
            if (!entryInFootprint && !exitInFootprint && !mouthExteriorIndices.has(idx)) removeIndices.add(idx);
            if (entryInFootprint) {
                const entryBelt = byCell.get(entryIdx);
                const entryExit = FloorBelt.getEntryExitSides(entryBelt.kind, entryBelt.facingIndex).exitSide;
                if (entryExit !== edgeMirrorSide(entrySide)) removeIndices.add(idx);
            }
            if (exitInFootprint) {
                const exitBelt = byCell.get(exitIdx);
                const exitEntry = FloorBelt.getEntryExitSides(exitBelt.kind, exitBelt.facingIndex).entrySide;
                if (exitEntry !== edgeMirrorSide(exitSide)) removeIndices.add(idx);
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
        zoneCells.map((cell) => cell.idx),
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
    const degreeByIndex = degreeInZone(zoneCells, neighborAtIdx);
    let floorBelts = buildCorridorBeltsFromPaths(paths, widths, globalLayout);
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
        globalCoordsByLocalIdx.set(cell.idx, { globalCol: cell.globalCol, globalRow: cell.globalRow });
    }
    const cols = grid.cols;
    const heightLevel = railConfig.wallHeightLevel ?? 1;
    const thicknessLevel = railConfig.edgeThickness ?? 1;
    for (let i = 0; i < floorBelts.length; i++) {
        const belt = floorBelts[i];
        const globalCoords = globalCoordsByLocalIdx.get(belt.idx);
        if (!globalCoords) continue;
        // Get the lateral rail sides for this belt kind and facing
        const sides = FloorBelt.getRailEdgeSides(belt.kind, belt.facingIndex);
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
export function hasOpenBeltMouthSideIdx(grid, navTopology, idx) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (grid.isBlockedIdx(idx)) return false;
    const navGraph = createNavGraphViewFromTopology(navTopology);
    let open = false;
    forEachCardinalNeighborIdx(idx, cols, rows, (nIdx) => {
        if (open) return;
        if (!grid.isBlockedIdx(nIdx) && navGraph.canStepIdx(nIdx, idx) && navGraph.canStepIdx(idx, nIdx)) open = true;
    });
    return open;
}
export function filterNavBeltEndpointCandidatesIdx(grid, navTopology, cellIndices) {
    const out = [];
    for (let i = 0; i < cellIndices.length; i++) {
        const idx = cellIndices[i];
        if (hasOpenBeltMouthSideIdx(grid, navTopology, idx)) out.push(idx);
    }
    return out;
}
export function beltPathMouthExteriorCells(path, cols, rows) {
    const startIdx = path[0];
    const secondIdx = path[1];
    const endIdx = path[path.length - 1];
    const prevIdx = path[path.length - 2];
    // The entry mouth is adjacent to startIdx, on the side pointing towards it from secondIdx.
    const startEntrySide = gridSideFromCellIdxToNeighborIdx(secondIdx, startIdx, cols);
    const entryExteriorIdx = edgeNeighborIdx(startIdx, startEntrySide, cols, rows);
    // The exit mouth is adjacent to endIdx, on the side pointing away from prevIdx.
    const endExitSide = gridSideFromCellIdxToNeighborIdx(prevIdx, endIdx, cols);
    const exitExteriorIdx = edgeNeighborIdx(endIdx, endExitSide, cols, rows);
    return { entryExteriorIdx, exitExteriorIdx };
}
export function validateBeltPathMouthAccess(grid, navTopology, path, occupiedGlobalIndices = new Set()) {
    if (path.length < 2) return false;
    const cols = grid.cols;
    const rows = grid.rows;
    const startIdx = path[0];
    const endIdx = path[path.length - 1];
    const { entryExteriorIdx, exitExteriorIdx } = beltPathMouthExteriorCells(path, cols, rows);
    if (entryExteriorIdx === -1 || exitExteriorIdx === -1) return false;
    if (grid.isBlockedIdx(entryExteriorIdx)) return false;
    if (grid.isBlockedIdx(exitExteriorIdx)) return false;
    if (occupiedGlobalIndices.has(entryExteriorIdx)) return false;
    if (occupiedGlobalIndices.has(exitExteriorIdx)) return false;
    const navGraph = createNavGraphViewFromTopology(navTopology);
    if (!navGraph.canStepIdx(entryExteriorIdx, startIdx)) return false;
    if (!navGraph.canStepIdx(endIdx, exitExteriorIdx)) return false;
    return true;
}
export function collectPathMouthExteriorIndices(paths, grid) {
    const cols = grid.cols;
    const rows = grid.rows;
    const mouths = new Set();
    for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        if (path.length < 2) continue;
        const startIdx = path[0];
        const endIdx = path[path.length - 1];
        mouths.add(startIdx);
        mouths.add(endIdx);
        const { entryExteriorIdx, exitExteriorIdx } = beltPathMouthExteriorCells(path, cols, rows);
        if (entryExteriorIdx !== -1) mouths.add(entryExteriorIdx);
        if (exitExteriorIdx !== -1) mouths.add(exitExteriorIdx);
    }
    return mouths;
}
export function stampGlobalRailMazeBelts(state, floorBelts) {
    const grid = state.obstacleGrid;
    let bounds = null;
    for (let i = 0; i < floorBelts.length; i++) {
        const belt = floorBelts[i];
        if (!grid.writeFloorCell(belt.idx, belt.kind, belt.facingIndex)) continue;
        const cellBounds = cellBoundsAtIdx(belt.idx, grid.cols);
        bounds = bounds ? unionCellBounds(bounds, cellBounds) : cellBounds;
    }
    if (bounds) FloorBelt.markZoneSubscriptionsDirty(state, bounds);
    return { bounds };
}
export function stampGlobalRailWalls(state, rails, { commit = true } = {}) {
    const grid = state.obstacleGrid;
    const cellSize = gridSettings.cellSize;
    const gridRails = [];
    for (let i = 0; i < rails.length; i++) {
        const wall = rails[i];
        const idx = grid.worldToIdx(wall.col * cellSize + grid.cellHalfSize, wall.row * cellSize + grid.cellHalfSize);
        if (idx < 0 || idx >= grid.grid.length) continue;
        gridRails.push({ idx, side: wall.side, heightLevel: wall.heightLevel, thicknessLevel: wall.thicknessLevel });
    }
    const result = stampRailWallsQuiet(state, gridRails);
    if (!commit || !result.bounds) return result;
    commitGridNavEdit(state, result.bounds);
    return result;
}
