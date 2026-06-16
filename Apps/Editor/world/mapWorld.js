import { unionCellBounds } from "../../../Libraries/DataStructures/CellRect.js";
import { gridSettings } from "../../../Config/Config.js";
import { rebuildLabMapCaches } from "../../../Libraries/Render/map/labMapCaches.js";
import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { fillRandomGrid, runCellularAutomata } from "../../../Libraries/CA/index.js";
import { centerReachAabbInto, createAabb, padAabb, unionAabb } from "../../../Libraries/Math/Aabb2D.js";
import { forEachObstacleGridCellInAabb } from "../../../Libraries/Spatial/grid/GridCoords.js";
import { setBoundary } from "../../../Libraries/Spatial/grid/boundaryOccupancy.js";
import { cellIsStaticWallAtIdx } from "../../../Libraries/Spatial/grid/gridCellTopology.js";
import { cellInRect } from "../../../Libraries/Spatial/grid/GridUtils.js";
import { syncGridTopologyCaches } from "../../../Libraries/Spatial/grid/vertexPassability.js";
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
} from "./mapGenBounds.js";
export const PLAY_AREA_CELL_OPTIONS = [64, 128, 256, 512, 1024];
const CLEAR_CIRCLE_BOUNDS = createAabb();
/** @param {number} cells */
export function playAreaCellsToIndex(cells) {
    const index = PLAY_AREA_CELL_OPTIONS.indexOf(cells);
    return index >= 0 ? index : PLAY_AREA_CELL_OPTIONS.indexOf(256);
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
    syncGridTopologyCaches(state.obstacleGrid, state.sandbox._passagePowerSyncKey ?? "");
    await state.navigation.onObstaclesChanged(null);
    await rebuildLabMapCaches(state);
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
    grid.bumpWallGridRevision();
    const damageBounds = { startCol, endCol, startRow, endRow };
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    return damageBounds;
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
    grid.bumpWallGridRevision();
    return { startCol, endCol, startRow, endRow };
}
/** @param {import("../state.js").TileLabGameState} state */
export async function eraseLabWallsInBounds(state) {
    ensureLabObstacleGridCoverage(state, getMapGenBoundsAabb(state.editor.eraseConfig, gridSettings.cellSize));
    const damageBounds = eraseWallsInShape(state);
    if (!damageBounds) return;
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    syncGridTopologyCaches(state.obstacleGrid, state.sandbox._passagePowerSyncKey ?? "");
    await state.navigation.onObstaclesChanged(damageBounds);
    state.worldSurfaces.clearBakeCache();
    await rebuildLabMapCaches(state);
}
export function ensureLabObstacleGridCoverage(state, extraAabb = null) {
    const cellSize = gridSettings.cellSize;
    let required = getMapGenBoundsAabb(state.editor.cavernConfig, cellSize);
    if (extraAabb) required = unionAabb(required, extraAabb);
    required = padAabb(required, cellSize);
    const grid = state.obstacleGrid;
    const expanded = grid.expandToCoverAabb(required);
    if (expanded) syncGridTopologyCaches(grid, state.sandbox._passagePowerSyncKey ?? "");
    return expanded;
}
/** @param {import("../TileLabEditorState.js").TileLabEditorState["cavernConfig"]} config @returns {{ originCol: number, originRow: number, cols: number, rows: number, cells: Uint8Array }} */
function generateCavernOccupancy(config) {
    const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(config);
    let cells = fillRandomGrid(cols, rows, config.fillChance);
    cells = runCellularAutomata(cols, rows, cells, { iterations: config.iterations, scratch: new Uint8Array(cols * rows) });
    applyMapGenShapeMask(cells, cols, rows, config, originCol, originRow);
    return { originCol, originRow, cols, rows, cells };
}
/** @param {import("../state.js").TileLabGameState} state */
export async function generateLabCaverns(state) {
    const { cavernConfig } = state.editor;
    const cellSize = gridSettings.cellSize;
    /** @type {{ originCol: number, originRow: number, cols: number, rows: number, cells: Uint8Array }} */
    let stamp = null;
    withSeededRandom(state.mapSeed, () => {
        stamp = generateCavernOccupancy(cavernConfig);
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
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    syncGridTopologyCaches(state.obstacleGrid, state.sandbox._passagePowerSyncKey ?? "");
    await state.navigation.onObstaclesChanged(damageBounds);
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
    await rebuildLabMapCaches(state);
}
export async function generateLabRailCaverns(state) {
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
    let damageBounds = { startCol, endCol, startRow, endRow };
    if (railConfig.boundsMode === "donut") {
        const innerR = getInnerRadiusCells(railConfig) * cellSize;
        const center = getMapGenBoundsCenterWorld(railConfig, cellSize);
        const cleared = clearStaticWallsInWorldCircle(state, center.x, center.y, innerR);
        if (cleared) damageBounds = unionCellBounds(damageBounds, cleared);
    }
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    syncGridTopologyCaches(state.obstacleGrid, state.sandbox._passagePowerSyncKey ?? "");
    await state.navigation.onObstaclesChanged(damageBounds);
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
    await rebuildLabMapCaches(state);
}
