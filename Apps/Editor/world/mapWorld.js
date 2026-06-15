import { gridSettings } from "../../../Config/Config.js";
import { rebuildLabMapCaches } from "../../../Libraries/Render/map/labMapCaches.js";
import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { fillRandomGrid, runCellularAutomata } from "../../../Libraries/CA/index.js";
import { centerReachAabbInto, createAabb, padAabb, unionAabb } from "../../../Libraries/Math/Aabb2D.js";
import { worldBoundsFromCellOrigin, forEachObstacleGridCellInAabb } from "../../../Libraries/Spatial/grid/GridCoords.js";
import { setBoundary } from "../../../Libraries/Spatial/grid/boundaryOccupancy.js";
import { cellIsStaticWallAtIdx } from "../../../Libraries/Spatial/grid/gridCellTopology.js";
import { cellInRect } from "../../../Libraries/Spatial/grid/GridUtils.js";
import { syncGridTopologyCaches } from "../../../Libraries/Spatial/grid/vertexPassability.js";
import { clampStampWallHeightLevel } from "../../../Libraries/WorldSurface/stampWallHeight.js";
import {
    applyCavernShapeMask,
    centerCavernBoundsOnViewport,
    getCavernBoundsAabb,
    getCavernBoundsAabbInto,
    getCavernCenterWorld,
    getCavernInnerRadiusCells,
    getCavernStampExtent,
    syncCavernSizeFromPlayArea,
    isCavernGlobalCellInBounds,
    migrateCavernConfigForMode,
} from "./cavernBounds.js";
import { getCellBoundsAabb, getCellBoundsAabbInto, getCellBoundsStampExtent } from "./cellBoundsConfig.js";
export { getCavernBoundsAabb, centerCavernBoundsOnViewport, syncCavernSizeFromPlayArea };
export const PLAY_AREA_CELL_OPTIONS = [64, 128, 256, 512, 1024];
const CLEAR_CIRCLE_BOUNDS = createAabb();
/** @param {number} cells */
export function playAreaCellsToIndex(cells) {
    const index = PLAY_AREA_CELL_OPTIONS.indexOf(cells);
    return index >= 0 ? index : PLAY_AREA_CELL_OPTIONS.indexOf(256);
}
/** @param {import("../TileLabEditorState.js").TileLabEditorState["cavernConfig"]} cavernConfig */
export function getCavernBoundsPreview(cavernConfig) {
    return getCavernBoundsAabb(cavernConfig, gridSettings.cellSize);
}
/** @param {import("../state.js").TileLabGameState} state */
export function refreshLabMapBoundsPreview(state) {
    const cache = state.editor.mapBoundsPreview;
    const { cavernConfig, railConfig } = state.editor;
    const cellSize = gridSettings.cellSize;
    const cfg = cavernConfig;
    if (
        cache.cavernMode !== cfg.boundsMode ||
        cache.cavernCol !== cfg.boundsCol ||
        cache.cavernRow !== cfg.boundsRow ||
        cache.cavernCols !== cfg.boundsCols ||
        cache.cavernRows !== cfg.boundsRows ||
        cache.centerCol !== cfg.centerCol ||
        cache.centerRow !== cfg.centerRow ||
        cache.outerRadiusCells !== cfg.outerRadiusCells ||
        cache.donutThicknessCells !== cfg.donutThicknessCells
    ) {
        cache.cavernMode = cfg.boundsMode;
        cache.cavernCol = cfg.boundsCol;
        cache.cavernRow = cfg.boundsRow;
        cache.cavernCols = cfg.boundsCols;
        cache.cavernRows = cfg.boundsRows;
        cache.centerCol = cfg.centerCol;
        cache.centerRow = cfg.centerRow;
        cache.outerRadiusCells = cfg.outerRadiusCells;
        cache.donutThicknessCells = cfg.donutThicknessCells;
        getCavernBoundsAabbInto(cache.cavern, cfg, cellSize);
    }
    const railCfg = railConfig;
    if (
        cache.railMode !== railCfg.boundsMode ||
        cache.railCol !== railCfg.boundsCol ||
        cache.railRow !== railCfg.boundsRow ||
        cache.railCols !== railCfg.boundsCols ||
        cache.railRows !== railCfg.boundsRows ||
        cache.railCenterCol !== railCfg.centerCol ||
        cache.railCenterRow !== railCfg.centerRow ||
        cache.railOuterRadiusCells !== railCfg.outerRadiusCells ||
        cache.railDonutThicknessCells !== railCfg.donutThicknessCells
    ) {
        cache.railMode = railCfg.boundsMode;
        cache.railCol = railCfg.boundsCol;
        cache.railRow = railCfg.boundsRow;
        cache.railCols = railCfg.boundsCols;
        cache.railRows = railCfg.boundsRows;
        cache.railCenterCol = railCfg.centerCol;
        cache.railCenterRow = railCfg.centerRow;
        cache.railOuterRadiusCells = railCfg.outerRadiusCells;
        cache.railDonutThicknessCells = railCfg.donutThicknessCells;
        getCellBoundsAabbInto(cache.rail, railCfg, cellSize);
    }
    const eraseCfg = state.editor.eraseConfig;
    if (
        cache.eraseMode !== eraseCfg.boundsMode ||
        cache.eraseCol !== eraseCfg.boundsCol ||
        cache.eraseRow !== eraseCfg.boundsRow ||
        cache.eraseCols !== eraseCfg.boundsCols ||
        cache.eraseRows !== eraseCfg.boundsRows ||
        cache.eraseCenterCol !== eraseCfg.centerCol ||
        cache.eraseCenterRow !== eraseCfg.centerRow ||
        cache.eraseOuterRadiusCells !== eraseCfg.outerRadiusCells ||
        cache.eraseDonutThicknessCells !== eraseCfg.donutThicknessCells
    ) {
        cache.eraseMode = eraseCfg.boundsMode;
        cache.eraseCol = eraseCfg.boundsCol;
        cache.eraseRow = eraseCfg.boundsRow;
        cache.eraseCols = eraseCfg.boundsCols;
        cache.eraseRows = eraseCfg.boundsRows;
        cache.eraseCenterCol = eraseCfg.centerCol;
        cache.eraseCenterRow = eraseCfg.centerRow;
        cache.eraseOuterRadiusCells = eraseCfg.outerRadiusCells;
        cache.eraseDonutThicknessCells = eraseCfg.donutThicknessCells;
        getCellBoundsAabbInto(cache.erase, eraseCfg, cellSize);
    }
}
/**
 * @param {import("../state.js").TileLabGameState["viewport"]} viewport
 * @param {import("../TileLabEditorState.js").TileLabEditorState["playConfig"]} playConfig
 * @param {import("../TileLabEditorState.js").TileLabEditorState["cavernConfig"]} cavernConfig
 * @param {{ center?: boolean, syncSizeFromPlay?: boolean }} [options]
 */
export function syncCavernBoundsFromPlay(viewport, playConfig, cavernConfig, { center = true, syncSizeFromPlay = false } = {}) {
    if (syncSizeFromPlay) syncCavernSizeFromPlayArea(playConfig, cavernConfig);
    if (center) centerCavernBoundsOnViewport(viewport, cavernConfig, gridSettings.cellSize);
}
/** Resize obstacle grid and sync cavern/rail stamp bounds to play area — centered on the camera. */
export function applyPlayAreaConfig(state) {
    const { viewport } = state;
    const { playConfig, cavernConfig, railConfig } = state.editor;
    syncCavernBoundsFromPlay(viewport, playConfig, cavernConfig, { center: true, syncSizeFromPlay: true });
    syncCavernBoundsFromPlay(viewport, playConfig, railConfig, { center: true, syncSizeFromPlay: true });
    syncCavernBoundsFromPlay(viewport, playConfig, state.editor.eraseConfig, { center: true, syncSizeFromPlay: true });
    migrateCavernConfigForMode(cavernConfig);
    migrateCavernConfigForMode(railConfig);
    migrateCavernConfigForMode(state.editor.eraseConfig);
    ensureLabObstacleGridCoverage(state);
    rebuildLabMapCaches(state);
}
/** @param {import("../state.js").TileLabGameState} state @param {number} centerWorldX @param {number} centerWorldY @param {number} radiusWorld */
function clearStaticWallsInWorldCircle(state, centerWorldX, centerWorldY, radiusWorld) {
    const grid = state.obstacleGrid;
    if (!grid?.cols || radiusWorld <= 0) return;
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
    if (startCol === Infinity) return;
    grid.bumpWallGridRevision();
    const damageBounds = { startCol, endCol, startRow, endRow };
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    state.navigation.onObstaclesChanged(damageBounds);
}
/** @param {import("../TileLabEditorState.js").TileLabEditorState["eraseConfig"]} config @param {number} globalCol @param {number} globalRow */
function isEraseCellInShape(config, globalCol, globalRow) {
    if (config.boundsMode === "rect") return globalCol >= config.boundsCol && globalCol < config.boundsCol + config.boundsCols && globalRow >= config.boundsRow && globalRow < config.boundsRow + config.boundsRows;
    const dist = Math.hypot(globalCol - config.centerCol, globalRow - config.centerRow);
    if (config.boundsMode === "circle") return dist <= config.outerRadiusCells;
    const innerR = getCavernInnerRadiusCells(config);
    return dist <= config.outerRadiusCells && dist >= innerR;
}
/** @param {import("../state.js").TileLabGameState} state @returns {{ startCol: number, endCol: number, startRow: number, endRow: number } | null} */
function eraseWallsInShape(state) {
    const grid = state.obstacleGrid;
    if (!grid?.cols) return null;
    const { eraseConfig } = state.editor;
    const cellSize = grid.cellSize;
    const { originCol, originRow, cols, rows } = getCellBoundsStampExtent(eraseConfig);
    let startCol = Infinity;
    let endCol = -1;
    let startRow = Infinity;
    let endRow = -1;
    for (let lr = 0; lr < rows; lr++)
        for (let lc = 0; lc < cols; lc++) {
            const globalCol = originCol + lc;
            const globalRow = originRow + lr;
            if (!isEraseCellInShape(eraseConfig, globalCol, globalRow)) continue;
            const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
            if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
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
            if (!cellChanged) continue;
            if (col < startCol) startCol = col;
            if (col > endCol) endCol = col;
            if (row < startRow) startRow = row;
            if (row > endRow) endRow = row;
        }
    if (startCol === Infinity) return null;
    grid.bumpWallGridRevision();
    return { startCol, endCol, startRow, endRow };
}
/** @param {import("../state.js").TileLabGameState} state */
export function eraseLabWallsInBounds(state) {
    ensureLabObstacleGridCoverage(state, getCellBoundsAabb(state.editor.eraseConfig, gridSettings.cellSize));
    const damageBounds = eraseWallsInShape(state);
    if (!damageBounds) return;
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    syncGridTopologyCaches(state.obstacleGrid, state.sandbox?._passagePowerSyncKey ?? "");
    state.navigation.onObstaclesChanged(damageBounds);
    state.worldSurfaces.clearBakeCache();
    rebuildLabMapCaches(state);
}
export function ensureLabObstacleGridCoverage(state, extraAabb = null) {
    const cellSize = gridSettings.cellSize;
    let required = getCavernBoundsPreview(state.editor.cavernConfig);
    if (extraAabb) required = unionAabb(required, extraAabb);
    required = padAabb(required, cellSize);
    const grid = state.obstacleGrid;
    const expanded = grid.expandToCoverAabb(required);
    if (expanded) {
        const centerX = (grid.minX + grid.maxX) / 2;
        const centerY = (grid.minY + grid.maxY) / 2;
        state.hierarchicalNavigator.initialize(centerX, centerY);
    }
}
/** @param {import("../TileLabEditorState.js").TileLabEditorState["cavernConfig"]} config @returns {{ originCol: number, originRow: number, cols: number, rows: number, cells: Uint8Array }} */
function generateCavernOccupancy(config) {
    const { originCol, originRow, cols, rows } = getCavernStampExtent(config);
    let cells = fillRandomGrid(cols, rows, config.fillChance);
    cells = runCellularAutomata(cols, rows, cells, { iterations: config.iterations, scratch: new Uint8Array(cols * rows) });
    applyCavernShapeMask(cells, cols, rows, config, originCol, originRow);
    return { originCol, originRow, cols, rows, cells };
}
/** @param {import("../state.js").TileLabGameState} state */
export function generateLabCaverns(state) {
    const { cavernConfig } = state.editor;
    const cellSize = gridSettings.cellSize;
    /** @type {{ originCol: number, originRow: number, cols: number, rows: number, cells: Uint8Array }} */
    let stamp = null;
    withSeededRandom(state.mapSeed, () => {
        stamp = generateCavernOccupancy(cavernConfig);
    });
    ensureLabObstacleGridCoverage(state);
    const level = clampStampWallHeightLevel(cavernConfig.wallHeightLevel, state.worldSurfaces.settings);
    const damageBounds = state.obstacleGrid.stampStaticWalls(stamp.originCol, stamp.originRow, stamp.cols, stamp.rows, stamp.cells, { additive: true, heightLevel: level });
    if (cavernConfig.boundsMode === "donut") {
        const innerR = getCavernInnerRadiusCells(cavernConfig) * cellSize;
        const center = getCavernCenterWorld(cavernConfig, cellSize);
        clearStaticWallsInWorldCircle(state, center.x, center.y, innerR);
    }
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    syncGridTopologyCaches(state.obstacleGrid, state.sandbox?._passagePowerSyncKey ?? "");
    state.navigation.onObstaclesChanged(damageBounds);
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
    rebuildLabMapCaches(state);
}
export function generateLabRailCaverns(state) {
    const { railConfig } = state.editor;
    const cellSize = gridSettings.cellSize;
    const stampBounds = getCellBoundsAabb(railConfig, cellSize);
    ensureLabObstacleGridCoverage(state, stampBounds);
    const level = clampStampWallHeightLevel(railConfig.wallHeightLevel, state.worldSurfaces.settings);
    const thickness = railConfig.edgeThickness ?? 2;
    const grid = state.obstacleGrid;
    const { originCol, originRow, cols, rows } = getCavernStampExtent(railConfig);
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
            const in1 = isCavernGlobalCellInBounds(railConfig, gc, gr - 1);
            const in2 = isCavernGlobalCellInBounds(railConfig, gc, gr);
            if (!in1 && !in2) hCells[lr * hCols + lc] = 0;
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
            const in1 = isCavernGlobalCellInBounds(railConfig, gc - 1, gr);
            const in2 = isCavernGlobalCellInBounds(railConfig, gc, gr);
            if (!in1 && !in2) vCells[lr * vCols + lc] = 0;
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
            if (row >= 0 && row < grid.rows && col >= 0 && col < grid.cols) setBoundary(grid, col, row, 0, { kind: "railWall", capHeightLevel: level, thicknessLevel: thickness });
            else if (row - 1 >= 0 && row - 1 < grid.rows && col >= 0 && col < grid.cols) setBoundary(grid, col, row - 1, 2, { kind: "railWall", capHeightLevel: level, thicknessLevel: thickness });
        }
    // 5. Stamp Vertical Edges
    for (let lr = 0; lr < vRows; lr++)
        for (let lc = 0; lc < vCols; lc++) {
            if (vCells[lr * vCols + lc] !== 1) continue;
            const col = baseCol + lc;
            const row = baseRow + lr;
            if (col >= 0 && col < grid.cols && row >= 0 && row < grid.rows) setBoundary(grid, col, row, 3, { kind: "railWall", capHeightLevel: level, thicknessLevel: thickness });
            else if (col - 1 >= 0 && col - 1 < grid.cols && row >= 0 && row < grid.rows) setBoundary(grid, col - 1, row, 1, { kind: "railWall", capHeightLevel: level, thicknessLevel: thickness });
        }
    grid.bumpWallGridRevision();
    const damageBounds = { startCol, endCol, startRow, endRow };
    if (railConfig.boundsMode === "donut") {
        const innerR = getCavernInnerRadiusCells(railConfig) * cellSize;
        const center = getCavernCenterWorld(railConfig, cellSize);
        clearStaticWallsInWorldCircle(state, center.x, center.y, innerR);
    }
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    syncGridTopologyCaches(state.obstacleGrid, state.sandbox?._passagePowerSyncKey ?? "");
    state.navigation.onObstaclesChanged(damageBounds);
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
    rebuildLabMapCaches(state);
}
