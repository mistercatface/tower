import { addCorridorPathToOccupied } from "../../Pathfinding/Corridor/corridorLanePath.js";
import { buildCorridorBeltsFromPaths } from "../../RoomGraph/roomGraphCorridorBelts.js";
import { createSeededRng } from "../../Math/SeededRng.js";
import { forEachGlobalCellInMapGenBounds } from "../../Sandbox/mapGenBounds.js";
import { CARDINAL_OFFSETS, cellInRect, colRowToIndex, gridCellLayout } from "../../Spatial/grid/GridUtils.js";
import { floorBeltEntryExitSides } from "../../Spatial/grid/FloorCell.js";
import { beltFootprintIndices, tryValidateBeltChains } from "./beltChainValidation.js";
import { collectPathMouthExteriorIndices, filterNavBeltEndpointCandidates, validateBeltPathMouthAccess } from "./railMazeBeltEndpoints.js";
import { createRailMazeNavCorridorPathfinder, findRailMazeNavCorridorPath } from "./railMazeNavCorridorPath.js";
const FULL_FOOTPRINT = { interiorOnly: false };
const DEFAULT_CORRIDOR_COUNT = 150;
const DEFAULT_PATH_LENGTH_MIN = 6;
const DEFAULT_PATH_LENGTH_MAX = 24;
const MAX_PAIR_ATTEMPTS_PER_CORRIDOR = 96;
const BELT_PLAN_SEED_SALT = 0xbe1a5afe;
const DEFAULT_OPEN_BELT_CHANCE = 0.1;
function cellIndex(col, row, cols) {
    return colRowToIndex(col, row, cols);
}
function manhattanCells(a, b) {
    return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}
function pathLengthInBand(path, minLen, maxLen) {
    return path.length >= minLen && path.length <= maxLen;
}
function navWalkableNeighbors(grid, gridNavContext, col, row) {
    const cardinals = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
    ];
    const out = [];
    for (let i = 0; i < cardinals.length; i++) {
        const nc = col + cardinals[i][0];
        const nr = row + cardinals[i][1];
        if (!cellInRect(nc, nr, grid.cols, grid.rows)) continue;
        if (grid.isBlocked(nc, nr)) continue;
        if (!grid.canStep(col, row, nc, nr, gridNavContext) && !grid.canStep(nc, nr, col, row, gridNavContext)) continue;
        out.push({ col: nc, row: nr });
    }
    return out;
}
/** @param {Set<number>} walkableIndices */
export function collectRailMazeBeltZoneCells(grid, gridNavContext, railConfig, northReserveRows, walkableIndices) {
    const cellSize = grid.cellSize;
    const beltStartGlobalRow = railConfig.boundsRow + Math.max(0, Math.round(northReserveRows));
    const cells = [];
    forEachGlobalCellInMapGenBounds(railConfig, (globalCol, globalRow) => {
        if (globalRow < beltStartGlobalRow) return;
        const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) return;
        if (!walkableIndices.has(cellIndex(col, row, grid.cols))) return;
        cells.push({ col, row, globalCol, globalRow });
    });
    return cells;
}
function collectNorthReserveProtectedIndices(grid, railConfig, northReserveRows) {
    const protectedIndices = new Set();
    const depth = Math.max(0, Math.round(northReserveRows));
    if (depth <= 0) return protectedIndices;
    const cellSize = grid.cellSize;
    const reserveEndGlobalRow = railConfig.boundsRow + depth - 1;
    forEachGlobalCellInMapGenBounds(railConfig, (globalCol, globalRow) => {
        if (globalRow > reserveEndGlobalRow) return;
        const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) return;
        protectedIndices.add(cellIndex(col, row, grid.cols));
    });
    return protectedIndices;
}
function degreeInZone(cells, neighborAt, cols) {
    const memberSet = new Set();
    for (let i = 0; i < cells.length; i++) memberSet.add(cellIndex(cells[i].col, cells[i].row, cols));
    const degreeByIndex = new Map();
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const neighbors = neighborAt(cell.col, cell.row).filter((n) => memberSet.has(cellIndex(n.col, n.row, cols)));
        degreeByIndex.set(cellIndex(cell.col, cell.row, cols), neighbors.length);
    }
    return degreeByIndex;
}
function collectNorthSeamMouthIndices(cells, northReserveRows, footprint, cols) {
    const mouths = new Set();
    if (northReserveRows <= 0) return mouths;
    let minGlobalRow = Infinity;
    for (let i = 0; i < cells.length; i++) minGlobalRow = Math.min(minGlobalRow, cells[i].globalRow);
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.globalRow !== minGlobalRow) continue;
        const idx = cellIndex(cell.col, cell.row, cols);
        if (!footprint.has(idx)) continue;
        mouths.add(idx);
    }
    return mouths;
}
function peelBrokenBelts(floorBelts, mouthExteriorIndices, layout) {
    let belts = floorBelts.slice();
    for (let pass = 0; pass < belts.length + 4; pass++) {
        const validation = tryValidateBeltChains(belts, layout, mouthExteriorIndices);
        if (validation.ok) return { floorBelts: belts, validation };
        const footprint = validation.footprint;
        const byCell = validation.beltsByCell;
        const removeIndices = new Set();
        for (const idx of footprint) {
            const belt = byCell.get(idx);
            const { entrySide, exitSide } = floorBeltEntryExitSides(belt.kind, belt.facingIndex);
            const entry = { col: belt.col + CARDINAL_OFFSETS[entrySide].dc, row: belt.row + CARDINAL_OFFSETS[entrySide].dr };
            const exit = { col: belt.col + CARDINAL_OFFSETS[exitSide].dc, row: belt.row + CARDINAL_OFFSETS[exitSide].dr };
            const entryIdx = cellIndex(entry.col, entry.row, layout.strideCols);
            const exitIdx = cellIndex(exit.col, exit.row, layout.strideCols);
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
        belts = belts.filter((belt) => !removeIndices.has(cellIndex(belt.col, belt.row, layout.strideCols)));
        if (belts.length === 0) return { floorBelts: belts, validation: tryValidateBeltChains(belts, layout, mouthExteriorIndices) };
    }
    return { floorBelts: belts, validation: tryValidateBeltChains(belts, layout, mouthExteriorIndices) };
}
function pickRandomFreeCell(freeCells, occupied, cols, rng) {
    if (freeCells.length < 2) return null;
    for (let attempt = 0; attempt < freeCells.length; attempt++) {
        const cell = freeCells[Math.floor(rng() * freeCells.length)];
        if (!occupied.has(cellIndex(cell.col, cell.row, cols))) return cell;
    }
    return null;
}
function pickRandomEndInLengthBand(start, endpointCells, occupied, cols, minLen, maxLen, rng) {
    const candidates = [];
    for (let i = 0; i < endpointCells.length; i++) {
        const cell = endpointCells[i];
        if (cell.col === start.col && cell.row === start.row) continue;
        if (occupied.has(cellIndex(cell.col, cell.row, cols))) continue;
        const dist = manhattanCells(start, cell);
        if (dist < minLen || dist > maxLen) continue;
        candidates.push(cell);
    }
    if (!candidates.length) return pickRandomFreeCell(endpointCells, occupied, cols, rng);
    return candidates[Math.floor(rng() * candidates.length)];
}
function planRandomNavCorridorPaths({ grid, gridNavContext, railConfig, zoneCells, walkableIndices, northReserveRows, corridorCount, corridorWidth, pathLengthMin, pathLengthMax, rng }) {
    const layout = gridCellLayout(grid);
    const endpointCells = filterNavBeltEndpointCandidates(
        grid,
        gridNavContext,
        zoneCells.map((cell) => ({ col: cell.col, row: cell.row })),
    );
    const pathfinder = createRailMazeNavCorridorPathfinder(grid, gridNavContext, railConfig, walkableIndices);
    /** @type {Set<number>} */
    const occupied = collectNorthReserveProtectedIndices(grid, railConfig, northReserveRows);
    /** @type {{ c: number, r: number }[][]} */
    const paths = [];
    /** @type {number[]} */
    const widths = [];
    for (let placed = 0; placed < corridorCount; placed++) {
        let placedPath = null;
        for (let attempt = 0; attempt < MAX_PAIR_ATTEMPTS_PER_CORRIDOR; attempt++) {
            const start = pickRandomFreeCell(endpointCells, occupied, grid.cols, rng);
            if (!start) break;
            const end = pickRandomEndInLengthBand(start, endpointCells, occupied, grid.cols, pathLengthMin, pathLengthMax, rng);
            if (!end) break;
            if (start.col === end.col && start.row === end.row) continue;
            const path = findRailMazeNavCorridorPath(pathfinder, start, end, occupied, corridorWidth, pathLengthMax);
            if (!path) continue;
            if (!pathLengthInBand(path, pathLengthMin, pathLengthMax)) continue;
            if (!validateBeltPathMouthAccess(grid, gridNavContext, path, occupied)) continue;
            placedPath = path;
            break;
        }
        if (!placedPath) break;
        paths.push(placedPath);
        widths.push(corridorWidth);
        addCorridorPathToOccupied(placedPath, occupied, corridorWidth, layout, FULL_FOOTPRINT);
    }
    return { paths, widths };
}
export function planRailMazeCorridorBelts({
    grid,
    gridNavContext,
    railConfig,
    northReserveRows,
    walkableKeys: walkableIndices,
    corridorCount = DEFAULT_CORRIDOR_COUNT,
    corridorWidth = 1,
    pathLengthMin = DEFAULT_PATH_LENGTH_MIN,
    pathLengthMax = DEFAULT_PATH_LENGTH_MAX,
    openBeltChance = DEFAULT_OPEN_BELT_CHANCE,
    mapSeed = 0,
    rng = null,
}) {
    const layout = gridCellLayout(grid);
    const zoneCells = collectRailMazeBeltZoneCells(grid, gridNavContext, railConfig, northReserveRows, walkableIndices);
    const random = rng ?? createSeededRng((mapSeed ^ BELT_PLAN_SEED_SALT) >>> 0);
    const { paths, widths } = planRandomNavCorridorPaths({
        grid,
        gridNavContext,
        railConfig,
        zoneCells,
        walkableIndices,
        northReserveRows,
        corridorCount,
        corridorWidth,
        pathLengthMin,
        pathLengthMax,
        rng: random,
    });
    const neighborAt = (col, row) => navWalkableNeighbors(grid, gridNavContext, col, row);
    const degreeByIndex = degreeInZone(zoneCells, neighborAt, grid.cols);
    let floorBelts = buildCorridorBeltsFromPaths(paths, widths, [], null, null, layout, { openBeltChance, rng: random });
    const protectedIndices = collectNorthReserveProtectedIndices(grid, railConfig, northReserveRows);
    if (protectedIndices.size) floorBelts = floorBelts.filter((belt) => !protectedIndices.has(cellIndex(belt.col, belt.row, grid.cols)));
    const footprint = beltFootprintIndices(floorBelts, layout);
    const mouthExteriorIndices = new Set([...collectNorthSeamMouthIndices(zoneCells, northReserveRows, footprint, grid.cols), ...collectPathMouthExteriorIndices(paths, grid)]);
    const peeled = peelBrokenBelts(floorBelts, mouthExteriorIndices, layout);
    floorBelts = peeled.floorBelts;
    const validation = peeled.validation;
    return { floorBelts, paths, zoneCellCount: zoneCells.length, pathCount: paths.length, mouthExteriorIndices, validation, degreeByIndex };
}
export function planRailMazeCorridorBeltsFromPreview(preview) {
    return planRailMazeCorridorBelts({
        grid: preview.grid,
        gridNavContext: preview.gridNavContext,
        railConfig: preview.railConfig,
        northReserveRows: preview.layout.northReserveRows,
        walkableKeys: preview.walkableIndices,
        mapSeed: preview.layout.mapSeed,
    });
}
