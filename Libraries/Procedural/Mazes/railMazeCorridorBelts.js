import { buildCorridorBeltsFromPaths } from "../../RoomGraph/roomGraphCorridorBelts.js";
import { forEachGlobalCellInMapGenBounds } from "../../Sandbox/mapGenBounds.js";
import { CARDINAL_OFFSETS, cellInRect } from "../../Spatial/grid/GridUtils.js";
import { floorBeltEntryExitSides } from "../../Spatial/grid/FloorCell.js";
import { beltFootprintKeys, tryValidateBeltChains } from "./beltChainValidation.js";
import { collectCorridorPathPolylines } from "./collectCorridorPathPolylines.js";

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

function dropJunctionBelts(belts, degreeByKey) {
    const out = [];
    for (let i = 0; i < belts.length; i++) {
        const belt = belts[i];
        const degree = degreeByKey.get(cellKey(belt.col, belt.row)) ?? 0;
        if (degree >= 3) continue;
        out.push(belt);
    }
    return out;
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

export function planRailMazeCorridorBelts({ grid, gridNavContext, railConfig, northReserveRows, walkableKeys }) {
    const zoneCells = collectRailMazeBeltZoneCells(grid, gridNavContext, railConfig, northReserveRows, walkableKeys);
    const neighborAt = (col, row) => navWalkableNeighbors(grid, gridNavContext, col, row);
    const degreeByKey = degreeInZone(zoneCells, neighborAt);
    const graphCells = zoneCells.map((c) => ({ col: c.col, row: c.row }));
    const paths = collectCorridorPathPolylines(graphCells, neighborAt);
    const widths = paths.map(() => 1);
    let floorBelts = buildCorridorBeltsFromPaths(paths, widths, [], null, null);
    floorBelts = dropJunctionBelts(floorBelts, degreeByKey);
    const footprint = beltFootprintKeys(floorBelts);
    const mouthExteriorKeys = collectNorthSeamMouthKeys(zoneCells, northReserveRows, footprint);
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
    });
}
