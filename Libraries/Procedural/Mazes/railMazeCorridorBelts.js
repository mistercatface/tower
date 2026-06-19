import { addCorridorPathToOccupied } from "../../Pathfinding/Corridor/corridorLanePath.js";
import { buildCorridorBeltsFromPaths } from "../../RoomGraph/roomGraphCorridorBelts.js";
import { createSeededRng } from "../../Math/SeededRng.js";
import { forEachGlobalCellInMapGenBounds } from "../../Sandbox/mapGenBounds.js";
import { CARDINAL_OFFSETS, cellInRect } from "../../Spatial/grid/GridUtils.js";
import { floorBeltEntryExitSides } from "../../Spatial/grid/FloorCell.js";
import { beltFootprintKeys, tryValidateBeltChains } from "./beltChainValidation.js";
import { createRailMazeNavCorridorPathfinder, findRailMazeNavCorridorPath } from "./railMazeNavCorridorPath.js";

const FULL_FOOTPRINT = { interiorOnly: false };
const DEFAULT_CORRIDOR_COUNT = 15;
const MAX_PAIR_ATTEMPTS_PER_CORRIDOR = 48;
const BELT_PLAN_SEED_SALT = 0xbe1a5afe;

function cellKey(col, row) {
    return `${col},${row}`;
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

export function collectRailMazeBeltZoneCells(grid, gridNavContext, railConfig, northReserveRows, walkableKeys) {
    const cellSize = grid.cellSize;
    const beltStartGlobalRow = railConfig.boundsRow + Math.max(0, Math.round(northReserveRows));
    const cells = [];
    forEachGlobalCellInMapGenBounds(railConfig, (globalCol, globalRow) => {
        if (globalRow < beltStartGlobalRow) return;
        const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) return;
        if (!walkableKeys.has(cellKey(col, row))) return;
        cells.push({ col, row, globalCol, globalRow });
    });
    return cells;
}

function collectNorthReserveProtectedKeys(grid, railConfig, northReserveRows) {
    const protectedKeys = new Set();
    const depth = Math.max(0, Math.round(northReserveRows));
    if (depth <= 0) return protectedKeys;
    const cellSize = grid.cellSize;
    const reserveEndGlobalRow = railConfig.boundsRow + depth - 1;
    forEachGlobalCellInMapGenBounds(railConfig, (globalCol, globalRow) => {
        if (globalRow > reserveEndGlobalRow) return;
        const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) return;
        protectedKeys.add(cellKey(col, row));
    });
    return protectedKeys;
}

function degreeInZone(cells, neighborAt) {
    const memberSet = new Set();
    for (let i = 0; i < cells.length; i++) memberSet.add(cellKey(cells[i].col, cells[i].row));
    const degreeByKey = new Map();
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const neighbors = neighborAt(cell.col, cell.row).filter((n) => memberSet.has(cellKey(n.col, n.row)));
        degreeByKey.set(cellKey(cell.col, cell.row), neighbors.length);
    }
    return degreeByKey;
}

function collectNorthSeamMouthKeys(cells, northReserveRows, footprint) {
    const mouths = new Set();
    if (northReserveRows <= 0) return mouths;
    let minGlobalRow = Infinity;
    for (let i = 0; i < cells.length; i++) minGlobalRow = Math.min(minGlobalRow, cells[i].globalRow);
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.globalRow !== minGlobalRow) continue;
        if (!footprint.has(cellKey(cell.col, cell.row))) continue;
        mouths.add(cellKey(cell.col, cell.row));
    }
    return mouths;
}

/** @param {{ c: number, r: number }[][]} paths */
function collectPathEndpointMouthKeys(paths) {
    const mouths = new Set();
    for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        if (path.length < 1) continue;
        mouths.add(cellKey(path[0].c, path[0].r));
        mouths.add(cellKey(path[path.length - 1].c, path[path.length - 1].r));
    }
    return mouths;
}

function peelBrokenBelts(floorBelts, mouthExteriorKeys) {
    let belts = floorBelts.slice();
    for (let pass = 0; pass < belts.length + 4; pass++) {
        const validation = tryValidateBeltChains(belts, mouthExteriorKeys);
        if (validation.ok) return { floorBelts: belts, validation };
        const footprint = validation.footprint;
        const byCell = validation.beltsByCell;
        const removeKeys = new Set();
        for (const key of footprint) {
            const belt = byCell.get(key);
            const { entrySide, exitSide } = floorBeltEntryExitSides(belt.kind, belt.facingIndex);
            const entry = { col: belt.col + CARDINAL_OFFSETS[entrySide].dc, row: belt.row + CARDINAL_OFFSETS[entrySide].dr };
            const exit = { col: belt.col + CARDINAL_OFFSETS[exitSide].dc, row: belt.row + CARDINAL_OFFSETS[exitSide].dr };
            const entryKey = cellKey(entry.col, entry.row);
            const exitKey = cellKey(exit.col, exit.row);
            const entryInFootprint = footprint.has(entryKey);
            const exitInFootprint = footprint.has(exitKey);
            if (!entryInFootprint && !exitInFootprint && !mouthExteriorKeys.has(key)) removeKeys.add(key);
            if (entryInFootprint) {
                const entryBelt = byCell.get(entryKey);
                const entryExit = floorBeltEntryExitSides(entryBelt.kind, entryBelt.facingIndex).exitSide;
                if (entryExit !== (entrySide + 2) % 4) removeKeys.add(key);
            }
            if (exitInFootprint) {
                const exitBelt = byCell.get(exitKey);
                const exitEntry = floorBeltEntryExitSides(exitBelt.kind, exitBelt.facingIndex).entrySide;
                if (exitEntry !== (exitSide + 2) % 4) removeKeys.add(key);
            }
        }
        if (removeKeys.size === 0) return { floorBelts: belts, validation };
        belts = belts.filter((belt) => !removeKeys.has(cellKey(belt.col, belt.row)));
        if (belts.length === 0) return { floorBelts: belts, validation: tryValidateBeltChains(belts, mouthExteriorKeys) };
    }
    return { floorBelts: belts, validation: tryValidateBeltChains(belts, mouthExteriorKeys) };
}

function pickRandomFreeCell(freeCells, occupied, rng) {
    if (freeCells.length < 2) return null;
    for (let attempt = 0; attempt < freeCells.length; attempt++) {
        const cell = freeCells[Math.floor(rng() * freeCells.length)];
        if (!occupied.has(cellKey(cell.col, cell.row))) return cell;
    }
    return null;
}

function planRandomNavCorridorPaths({ grid, gridNavContext, railConfig, zoneCells, walkableKeys, northReserveRows, corridorCount, corridorWidth, rng }) {
    const freeCells = zoneCells.map((cell) => ({ col: cell.col, row: cell.row }));
    const pathfinder = createRailMazeNavCorridorPathfinder(grid, gridNavContext, railConfig, walkableKeys);
    /** @type {Set<string>} */
    const occupied = collectNorthReserveProtectedKeys(grid, railConfig, northReserveRows);
    /** @type {{ c: number, r: number }[][]} */
    const paths = [];
    /** @type {number[]} */
    const widths = [];
    for (let placed = 0; placed < corridorCount; placed++) {
        let placedPath = null;
        for (let attempt = 0; attempt < MAX_PAIR_ATTEMPTS_PER_CORRIDOR; attempt++) {
            const start = pickRandomFreeCell(freeCells, occupied, rng);
            if (!start) break;
            const end = pickRandomFreeCell(freeCells, occupied, rng);
            if (!end) break;
            if (start.col === end.col && start.row === end.row) continue;
            const path = findRailMazeNavCorridorPath(pathfinder, start, end, occupied, corridorWidth);
            if (!path) continue;
            placedPath = path;
            break;
        }
        if (!placedPath) break;
        paths.push(placedPath);
        widths.push(corridorWidth);
        addCorridorPathToOccupied(placedPath, occupied, corridorWidth, FULL_FOOTPRINT);
    }
    return { paths, widths };
}

export function planRailMazeCorridorBelts({
    grid,
    gridNavContext,
    railConfig,
    northReserveRows,
    walkableKeys,
    corridorCount = DEFAULT_CORRIDOR_COUNT,
    corridorWidth = 1,
    mapSeed = 0,
    rng = null,
}) {
    const zoneCells = collectRailMazeBeltZoneCells(grid, gridNavContext, railConfig, northReserveRows, walkableKeys);
    const random = rng ?? createSeededRng((mapSeed ^ BELT_PLAN_SEED_SALT) >>> 0);
    const { paths, widths } = planRandomNavCorridorPaths({
        grid,
        gridNavContext,
        railConfig,
        zoneCells,
        walkableKeys,
        northReserveRows,
        corridorCount,
        corridorWidth,
        rng: random,
    });
    const neighborAt = (col, row) => navWalkableNeighbors(grid, gridNavContext, col, row);
    const degreeByKey = degreeInZone(zoneCells, neighborAt);
    let floorBelts = buildCorridorBeltsFromPaths(paths, widths, [], null, null);
    const protectedKeys = collectNorthReserveProtectedKeys(grid, railConfig, northReserveRows);
    if (protectedKeys.size) floorBelts = floorBelts.filter((belt) => !protectedKeys.has(cellKey(belt.col, belt.row)));
    const footprint = beltFootprintKeys(floorBelts);
    const mouthExteriorKeys = new Set([
        ...collectNorthSeamMouthKeys(zoneCells, northReserveRows, footprint),
        ...collectPathEndpointMouthKeys(paths),
    ]);
    const peeled = peelBrokenBelts(floorBelts, mouthExteriorKeys);
    floorBelts = peeled.floorBelts;
    const validation = peeled.validation;
    return {
        floorBelts,
        paths,
        zoneCellCount: zoneCells.length,
        pathCount: paths.length,
        mouthExteriorKeys,
        validation,
        degreeByKey,
    };
}

export function planRailMazeCorridorBeltsFromPreview(preview) {
    return planRailMazeCorridorBelts({
        grid: preview.grid,
        gridNavContext: preview.gridNavContext,
        railConfig: preview.railConfig,
        northReserveRows: preview.layout.northReserveRows,
        walkableKeys: preview.walkableKeys,
        mapSeed: preview.layout.mapSeed,
    });
}
