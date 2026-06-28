import { unionCellBounds } from "../../../Libraries/DataStructures/CellRect.js";
import { gridSettings } from "../../../Config/world.js";
import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { fillRandomGrid, runCellularAutomata } from "../../../Libraries/CA/index.js";
import { bakeRailMazeDfs } from "../../../Libraries/Procedural/Mazes/railMazeDfs.js";
import { generateCavernOccupancy } from "../../../Libraries/Procedural/Mazes/cavernOccupancy.js";
import { stampGlobalRailWalls } from "../../../Libraries/Procedural/Mazes/stampRailWalls.js";
import { commitGridNavEdit, commitGridNavEditUnion } from "../../../Libraries/Sandbox/gridNavEdit.js";
import { planRailMazeCorridorBelts } from "../../../Libraries/Procedural/Mazes/railMazeCorridorBelts.js";
import { stampGlobalRailMazeBelts } from "../../../Libraries/Procedural/Mazes/stampGlobalRailMazeBelts.js";
import { getNavWalkableCellIndex } from "../../../Libraries/Procedural/Mazes/walkableCells.js";
import { centerReachAabbInto, createAabb, padAabb, unionAabb } from "../../../Libraries/Math/Aabb2D.js";
import { forEachObstacleGridCellInAabb } from "../../../Libraries/Spatial/grid/GridCoords.js";
import { setBoundary } from "../../../Libraries/Spatial/grid/boundaryOccupancy.js";
import { cellIsStaticWallAtIdx } from "../../../Libraries/Spatial/grid/gridCellTopology.js";
import { cellInRect, colRowToIndex } from "../../../Libraries/Spatial/grid/GridUtils.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "../../../Libraries/Spatial/grid/gridNavEpoch.js";
import { clampStampWallHeightLevel } from "../../../Libraries/WorldSurface/stampWallHeight.js";
import {
    MAP_GEN_KINDS,
    applyMapGenShapeMask,
    forEachGlobalCellInMapGenBounds,
    getInnerRadiusCells,
    getMapGenBoundsAabb,
    getMapGenBoundsCenterWorld,
    getMapGenBoundsStampExtent,
    isGlobalCellInMapGenBounds,
    migrateMapGenBoundsForMode,
    syncMapGenBoundsFromPlay,
    getMapGenBoundsConfig,
} from "../../../Libraries/Sandbox/mapGenBounds.js";
export const PLAY_AREA_CELL_OPTIONS = [64, 128, 256, 512, 1024];
const CLEAR_CIRCLE_BOUNDS = createAabb();
/** @param {number} cells */
export function playAreaCellsToIndex(cells) {
    const index = PLAY_AREA_CELL_OPTIONS.indexOf(cells);
    return index >= 0 ? index : PLAY_AREA_CELL_OPTIONS.indexOf(256);
}
/** Tile Lab cold start: play area, nav worker sync, map overview + path-debug caches. */
export async function initTileLabWorld(state) {
    await applyPlayAreaConfig(state);
}
/** Resize obstacle grid and sync cavern/rail stamp bounds to play area — centered on the camera. */
export async function applyPlayAreaConfig(state) {
    const { viewport, editor } = state;
    const { playConfig } = editor;
    const cellSize = gridSettings.cellSize;
    for (let i = 0; i < MAP_GEN_KINDS.length; i++) {
        const kind = MAP_GEN_KINDS[i];
        const config = getMapGenBoundsConfig(editor, kind);
        syncMapGenBoundsFromPlay(viewport, playConfig, config, cellSize, { center: true, syncSizeFromPlay: true });
        migrateMapGenBoundsForMode(config);
    }
    ensureLabObstacleGridCoverage(state);
    await commitGridNavEdit(state, null, { fullNavSync: true });
}
/** @param {import("../state.js").TileLabGameState} state @param {number} centerWorldX @param {number} centerWorldY @param {number} radiusWorld @returns {{ startCol: number, endCol: number, startRow: number, endRow: number } | null} */
function clearStaticWallsInWorldCircle(state, centerWorldX, centerWorldY, radiusWorld) {
    const grid = state.obstacleGrid;
    centerReachAabbInto(CLEAR_CIRCLE_BOUNDS, centerWorldX, centerWorldY, radiusWorld);
    let startCol = Infinity;
    let endCol = -1;
    let startRow = Infinity;
    let endRow = -1;
    forEachObstacleGridCellInAabb(grid, CLEAR_CIRCLE_BOUNDS, (col, row, idx) => {
        const bounds = grid.getCellBounds(col, row);
        const cx = (bounds.minX + bounds.maxX) * 0.5;
        const cy = (bounds.minY + bounds.maxY) * 0.5;
        if (Math.hypot(cx - centerWorldX, cy - centerWorldY) >= radiusWorld) return;
        let cellChanged = false;
        if (cellIsStaticWallAtIdx(grid, idx)) {
            grid.grid[idx] = 0;
            cellChanged = true;
        }
        if (grid.edgeStore.hasAnyAtIdx(idx)) {
            grid.clearCellEdges(col, row);
            cellChanged = true;
        }
        if (!cellChanged) return;
        if (col < startCol) startCol = col;
        if (col > endCol) endCol = col;
        if (row < startRow) startRow = row;
        if (row > endRow) endRow = row;
    });
    if (startCol === Infinity) return null;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return { startCol, endCol, startRow, endRow };
}
/** @param {import("../state.js").TileLabGameState} state @returns {{ startCol: number, endCol: number, startRow: number, endRow: number } | null} */
function eraseWallsInShape(state) {
    const grid = state.obstacleGrid;
    const eraseConfig = state.editor.eraseConfig;
    const cellSize = grid.cellSize;
    let startCol = Infinity;
    let endCol = -1;
    let startRow = Infinity;
    let endRow = -1;
    forEachGlobalCellInMapGenBounds(eraseConfig, (globalCol, globalRow) => {
        const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) return;
        const idx = col + row * grid.cols;
        let cellChanged = false;
        if (cellIsStaticWallAtIdx(grid, idx)) {
            grid.grid[idx] = 0;
            cellChanged = true;
        }
        if (grid.edgeStore.hasAnyAtIdx(idx)) {
            grid.clearCellEdges(col, row);
            cellChanged = true;
        }
        if (!cellChanged) return;
        if (col < startCol) startCol = col;
        if (col > endCol) endCol = col;
        if (row < startRow) startRow = row;
        if (row > endRow) endRow = row;
    });
    if (startCol === Infinity) return null;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return { startCol, endCol, startRow, endRow };
}
/** @param {import("../state.js").TileLabGameState} state */
export async function eraseLabWallsInBounds(state) {
    ensureLabObstacleGridCoverage(state, getMapGenBoundsAabb(state.editor.eraseConfig, gridSettings.cellSize));
    const damageBounds = eraseWallsInShape(state);
    if (!damageBounds) return;
    await commitGridNavEdit(state, damageBounds);
    state.worldSurfaces.clearBakeCache();
}
export function ensureLabObstacleGridCoverage(state, extraAabb = null) {
    const cellSize = gridSettings.cellSize;
    let required = getMapGenBoundsAabb(state.editor.cavernConfig, cellSize);
    if (extraAabb) required = unionAabb(required, extraAabb);
    required = padAabb(required, cellSize);
    const grid = state.obstacleGrid;
    const expanded = grid.expandToCoverAabb(required);
    return expanded;
}
/** @param {import("../state.js").TileLabGameState} state */
export async function generateLabCaverns(state, { openBoundarySides = null, openBoundaryRows = 1 } = {}) {
    const { cavernConfig } = state.editor;
    const cellSize = gridSettings.cellSize;
    /** @type {{ originCol: number, originRow: number, cols: number, rows: number, cells: Uint8Array }} */
    let stamp = null;
    withSeededRandom(state.mapSeed, () => {
        stamp = generateCavernOccupancy(cavernConfig, { openBoundarySides, openBoundaryRows });
    });
    ensureLabObstacleGridCoverage(state);
    const level = clampStampWallHeightLevel(cavernConfig.wallHeightLevel, state.worldSurfaces.settings);
    let damageBounds = state.obstacleGrid.stampStaticWalls(stamp.originCol, stamp.originRow, stamp.cols, stamp.rows, stamp.cells, { additive: true, heightLevel: level });
    if (cavernConfig.boundsMode === "donut") {
        const innerR = getInnerRadiusCells(cavernConfig) * cellSize;
        const center = getMapGenBoundsCenterWorld(cavernConfig, cellSize);
        const cleared = clearStaticWallsInWorldCircle(state, center.x, center.y, innerR);
        if (cleared) damageBounds = unionCellBounds(damageBounds, cleared);
    }
    await commitGridNavEdit(state, damageBounds);
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
}
function clearRailStampCellBounds(grid, startCol, endCol, startRow, endRow) {
    for (let r = startRow; r <= endRow; r++)
        for (let c = startCol; c <= endCol; c++) {
            const idx = c + r * grid.cols;
            if (grid.grid[idx] !== 0) grid.grid[idx] = 0;
            if (grid.edgeStore.hasAnyAtIdx(idx)) grid.clearCellEdges(c, r);
        }
}
function clearMapGenRectWalkable(state, config) {
    const grid = state.obstacleGrid;
    const cellSize = gridSettings.cellSize;
    const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(config);
    const { col: baseCol, row: baseRow } = grid.worldToGrid(originCol * cellSize, originRow * cellSize);
    const startCol = Math.max(0, baseCol);
    const endCol = Math.min(grid.cols - 1, baseCol + cols - 1);
    const startRow = Math.max(0, baseRow);
    const endRow = Math.min(grid.rows - 1, baseRow + rows - 1);
    clearRailStampCellBounds(grid, startCol, endCol, startRow, endRow);
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return { startCol, endCol, startRow, endRow };
}
export function clearSnakeRegionPaddingStrip(state, paddingCells) {
    const { cavernConfig, playConfig } = state.editor;
    const padding = Math.max(0, Math.round(paddingCells));
    const innerRows = Math.max(2, playConfig.playAreaRows - padding);
    const topRows = Math.floor(innerRows / 2);
    return clearMapGenRectWalkable(state, {
        boundsMode: "rect",
        boundsCol: cavernConfig.boundsCol,
        boundsRow: cavernConfig.boundsRow + topRows,
        boundsCols: cavernConfig.boundsCols,
        boundsRows: padding,
    });
}
function clearRailZoneNorthStrip(grid, startCol, endCol, startRow, endRow, stripRows) {
    const depth = Math.max(1, Math.round(stripRows));
    const lastRow = Math.min(endRow, startRow + depth - 1);
    for (let r = startRow; r <= lastRow; r++)
        for (let c = startCol; c <= endCol; c++) {
            grid.grid[c + r * grid.cols] = 0;
            grid.clearCellEdges(c, r);
        }
    return { startCol, endCol, startRow, endRow: lastRow };
}
export async function generateLabRailDfsMaze(state, options = {}) {
    const { railConfig } = state.editor;
    const cellSize = gridSettings.cellSize;
    const stampBoundsAabb = getMapGenBoundsAabb(railConfig, cellSize);
    ensureLabObstacleGridCoverage(state, stampBoundsAabb);
    const grid = state.obstacleGrid;
    const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(railConfig);
    const { col: baseCol, row: baseRow } = grid.worldToGrid(originCol * cellSize, originRow * cellSize);
    const startCol = Math.max(0, baseCol);
    const endCol = Math.min(grid.cols - 1, baseCol + cols - 1);
    const startRow = Math.max(0, baseRow);
    const endRow = Math.min(grid.rows - 1, baseRow + rows - 1);
    clearRailStampCellBounds(grid, startCol, endCol, startRow, endRow);
    const rails = bakeRailMazeDfs(
        { originCol, originRow, cols, rows },
        {
            railWallHeightLevel: options.railWallHeightLevel ?? railConfig.wallHeightLevel,
            railWallThicknessLevel: options.railWallThicknessLevel ?? railConfig.edgeThickness,
            corridorWidthMin: options.corridorWidthMin,
            corridorWidthMax: options.corridorWidthMax,
            extraLinkRatio: options.extraLinkRatio,
            northReserveRows: options.northReserveRows,
        },
        state.mapSeed,
    );
    stampGlobalRailWalls(state, rails, { commit: false });
    const northRows = Math.max(1, Math.round(options.northReserveRows ?? 3));
    const northBounds = clearRailZoneNorthStrip(grid, startCol, endCol, startRow, endRow, northRows);
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    const damageBounds = unionCellBounds({ startCol, endCol, startRow, endRow }, northBounds);
    await commitGridNavEdit(state, damageBounds);
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
}
export async function generateLabRailCaverns(state, { openBoundarySides = null } = {}) {
    const { railConfig } = state.editor;
    const cellSize = gridSettings.cellSize;
    const stampBounds = getMapGenBoundsAabb(railConfig, cellSize);
    ensureLabObstacleGridCoverage(state, stampBounds);
    const level = clampStampWallHeightLevel(railConfig.wallHeightLevel, state.worldSurfaces.settings);
    const thickness = railConfig.edgeThickness;
    const grid = state.obstacleGrid;
    const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(railConfig);
    // 1. Generate Horizontal Edges CA
    const hCols = cols;
    const hRows = rows + 1;
    let hCells = null;
    withSeededRandom(state.mapSeed, () => {
        hCells = fillRandomGrid(hCols, hRows, railConfig.fillChance);
        hCells = runCellularAutomata(hCols, hRows, hCells, { iterations: railConfig.iterations, scratch: new Uint8Array(hCols * hRows) });
    });
    // Mask Horizontal Edges based on cavern shape bounds
    for (let lr = 0; lr < hRows; lr++)
        for (let lc = 0; lc < hCols; lc++) {
            const gc = originCol + lc;
            const gr = originRow + lr;
            const in1 = isGlobalCellInMapGenBounds(railConfig, gc, gr - 1);
            const in2 = isGlobalCellInMapGenBounds(railConfig, gc, gr);
            if (!in1 && !in2) hCells[lr * hCols + lc] = 0;
        }
    if (openBoundarySides?.north) for (let lc = 0; lc < hCols; lc++) hCells[lc] = 0;
    if (openBoundarySides?.south) {
        const lr = hRows - 1;
        for (let lc = 0; lc < hCols; lc++) hCells[lr * hCols + lc] = 0;
    }
    // 2. Generate Vertical Edges CA (slightly offset the seed so H and V structures are unique)
    const vCols = cols + 1;
    const vRows = rows;
    let vCells = null;
    withSeededRandom(state.mapSeed + 1, () => {
        vCells = fillRandomGrid(vCols, vRows, railConfig.fillChance);
        vCells = runCellularAutomata(vCols, vRows, vCells, { iterations: railConfig.iterations, scratch: new Uint8Array(vCols * vRows) });
    });
    // Mask Vertical Edges based on cavern shape bounds
    for (let lr = 0; lr < vRows; lr++)
        for (let lc = 0; lc < vCols; lc++) {
            const gc = originCol + lc;
            const gr = originRow + lr;
            const in1 = isGlobalCellInMapGenBounds(railConfig, gc - 1, gr);
            const in2 = isGlobalCellInMapGenBounds(railConfig, gc, gr);
            if (!in1 && !in2) vCells[lr * vCols + lc] = 0;
        }
    if (openBoundarySides?.west) for (let lr = 0; lr < vRows; lr++) vCells[lr * vCols] = 0;
    if (openBoundarySides?.east) {
        const lc = vCols - 1;
        for (let lr = 0; lr < vRows; lr++) vCells[lr * vCols + lc] = 0;
    }
    const { col: baseCol, row: baseRow } = grid.worldToGrid(originCol * cellSize, originRow * cellSize);
    const startCol = Math.max(0, baseCol);
    const endCol = Math.min(grid.cols - 1, baseCol + cols - 1);
    const startRow = Math.max(0, baseRow);
    const endRow = Math.min(grid.rows - 1, baseRow + rows - 1);
    // 3. Clear existing walls & edges in target bounds
    for (let r = startRow; r <= endRow; r++)
        for (let c = startCol; c <= endCol; c++) {
            const idx = c + r * grid.cols;
            if (grid.grid[idx] !== 0) grid.grid[idx] = 0;
            if (grid.edgeStore.hasAnyAtIdx(idx)) grid.clearCellEdges(c, r);
        }
    // 4. Stamp Horizontal Edges
    for (let lr = 0; lr < hRows; lr++)
        for (let lc = 0; lc < hCols; lc++) {
            if (hCells[lr * hCols + lc] !== 1) continue;
            const col = baseCol + lc;
            const row = baseRow + lr;
            if (row >= 0 && row < grid.rows && col >= 0 && col < grid.cols) setBoundary(grid, colRowToIndex(col, row, grid.cols), 0, { kind: "railWall", capHeightLevel: level, thicknessLevel: thickness });
            else if (row - 1 >= 0 && row - 1 < grid.rows && col >= 0 && col < grid.cols) setBoundary(grid, colRowToIndex(col, row - 1, grid.cols), 2, { kind: "railWall", capHeightLevel: level, thicknessLevel: thickness });
        }
    // 5. Stamp Vertical Edges
    for (let lr = 0; lr < vRows; lr++)
        for (let lc = 0; lc < vCols; lc++) {
            if (vCells[lr * vCols + lc] !== 1) continue;
            const col = baseCol + lc;
            const row = baseRow + lr;
            if (col >= 0 && col < grid.cols && row >= 0 && row < grid.rows) setBoundary(grid, colRowToIndex(col, row, grid.cols), 3, { kind: "railWall", capHeightLevel: level, thicknessLevel: thickness });
            else if (col - 1 >= 0 && col - 1 < grid.cols && row >= 0 && row < grid.rows) setBoundary(grid, colRowToIndex(col - 1, row, grid.cols), 1, { kind: "railWall", capHeightLevel: level, thicknessLevel: thickness });
        }
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    let damageBounds = { startCol, endCol, startRow, endRow };
    if (railConfig.boundsMode === "donut") {
        const innerR = getInnerRadiusCells(railConfig) * cellSize;
        const center = getMapGenBoundsCenterWorld(railConfig, cellSize);
        const cleared = clearStaticWallsInWorldCircle(state, center.x, center.y, innerR);
        if (cleared) damageBounds = unionCellBounds(damageBounds, cleared);
    }
    await commitGridNavEdit(state, damageBounds);
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
}
export async function generateLabRailMaze(state, options = {}) {
    const config = options.boundsConfig ?? state.editor.railMazeConfig;
    const cellSize = gridSettings.cellSize;
    const stampBoundsAabb = getMapGenBoundsAabb(config, cellSize);
    ensureLabObstacleGridCoverage(state, stampBoundsAabb);
    const grid = state.obstacleGrid;
    const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(config);
    const { col: baseCol, row: baseRow } = grid.worldToGrid(originCol * cellSize, originRow * cellSize);
    const startCol = Math.max(0, baseCol);
    const endCol = Math.min(grid.cols - 1, baseCol + cols - 1);
    const startRow = Math.max(0, baseRow);
    const endRow = Math.min(grid.rows - 1, baseRow + rows - 1);
    clearRailStampCellBounds(grid, startCol, endCol, startRow, endRow);
    const railWallHeightLevel = options.railWallHeightLevel ?? config.wallHeightLevel;
    const railWallThicknessLevel = options.railWallThicknessLevel ?? config.edgeThickness;
    const corridorWidthMin = options.corridorWidthMin ?? config.corridorWidthMin;
    const corridorWidthMax = options.corridorWidthMax ?? config.corridorWidthMax;
    const extraLinkRatio = options.extraLinkRatio ?? config.extraLinkRatio;
    const northReserveRows = options.northReserveRows ?? config.northReserveRows;
    let rails = bakeRailMazeDfs(
        { originCol, originRow, cols, rows },
        { railWallHeightLevel, railWallThicknessLevel, corridorWidthMin, corridorWidthMax, extraLinkRatio, northReserveRows },
        state.mapSeed,
    );
    if (config.boundsMode !== "rect")
        rails = rails.filter((wall) => {
            const inCell = isGlobalCellInMapGenBounds(config, wall.col, wall.row);
            let inNeighbor = false;
            if (wall.side === 0) inNeighbor = isGlobalCellInMapGenBounds(config, wall.col, wall.row - 1);
            else if (wall.side === 1) inNeighbor = isGlobalCellInMapGenBounds(config, wall.col + 1, wall.row);
            else if (wall.side === 2) inNeighbor = isGlobalCellInMapGenBounds(config, wall.col, wall.row + 1);
            else if (wall.side === 3) inNeighbor = isGlobalCellInMapGenBounds(config, wall.col - 1, wall.row);
            return inCell || inNeighbor;
        });

    stampGlobalRailWalls(state, rails, { commit: false });
    const northRows = Math.max(0, Math.round(northReserveRows ?? 0));
    let northBounds = null;
    if (northRows > 0) northBounds = clearRailZoneNorthStrip(grid, startCol, endCol, startRow, endRow, northRows);

    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    let damageBounds = { startCol, endCol, startRow, endRow };
    if (northBounds) damageBounds = unionCellBounds(damageBounds, northBounds);
    if (config.boundsMode === "donut") {
        const innerR = getInnerRadiusCells(config) * cellSize;
        const center = getMapGenBoundsCenterWorld(config, cellSize);
        const cleared = clearStaticWallsInWorldCircle(state, center.x, center.y, innerR);
        if (cleared) damageBounds = unionCellBounds(damageBounds, cleared);
    }
    await commitGridNavEdit(state, damageBounds);
    const centerCol = config.boundsMode === "rect" ? config.boundsCol + Math.floor(config.boundsCols / 2) : config.centerCol;
    const centerRow = config.boundsMode === "rect" ? config.boundsRow + Math.floor(config.boundsRows / 2) : config.centerRow;
    const floodSeedBounds = options.floodSeedBounds ?? { boundsMode: "rect", boundsCol: centerCol, boundsRow: centerRow, boundsCols: 1, boundsRows: 1 };
    const navWalkableIndex = options.navWalkableIndex ?? getNavWalkableCellIndex(state, config, floodSeedBounds);
    const beltPlan = planRailMazeCorridorBelts({ grid, navTopology: state.nav.topology, railConfig: config, northReserveRows: northRows, navWalkableIndex, mapSeed: state.mapSeed });
    const { bounds: beltBounds } = stampGlobalRailMazeBelts(state, beltPlan.floorBelts);
    await commitGridNavEditUnion(state, damageBounds, beltBounds);
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
}
