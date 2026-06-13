import { gridSettings } from "../../../Config/Config.js";
import { rebuildLabMapCaches } from "../../../Libraries/Render/map/labMapCaches.js";
import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { fillRandomGrid, runCellularAutomata } from "../../../Libraries/CA/index.js";
import { centeredAabb, centeredAabbInto, centerReachAabbInto, createAabb, padAabb, unionAabb } from "../../../Libraries/Math/Aabb2D.js";
import { packCellKey } from "../../../Libraries/DataStructures/CellKey.js";
import { worldBoundsFromCellOrigin, forEachObstacleGridCellInAabb } from "../../../Libraries/Spatial/grid/GridCoords.js";
import { computeBoundsFromWalls } from "../../../Libraries/Spatial/grid/wallGridBake.js";
import { clearSandboxWallsInBounds } from "../../../Libraries/Sandbox/spawnAssembly.js";
import { cellIsStaticWallAtIdx, gridCellToGlobalColRow } from "../../../Libraries/World/wallGridCells.js";
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
} from "./cavernBounds.js";
import { getCellBoundsAabb, getCellBoundsAabbInto } from "./cellBoundsConfig.js";
export { getCavernBoundsAabb, centerCavernBoundsOnViewport, syncCavernSizeFromPlayArea };
export const PLAY_AREA_CELL_OPTIONS = [64, 128, 256, 512, 1024];
const CLEAR_CIRCLE_BOUNDS = createAabb();
/** @param {number} cells */
export function playAreaCellsToIndex(cells) {
    const index = PLAY_AREA_CELL_OPTIONS.indexOf(cells);
    return index >= 0 ? index : PLAY_AREA_CELL_OPTIONS.indexOf(256);
}
/** @param {import("../state.js").TileLabGameState["viewport"]} viewport @param {{ playAreaCols: number, playAreaRows: number }} playConfig */
export function getPlayAreaPreviewBounds(viewport, playConfig) {
    const cellSize = gridSettings.cellSize;
    return centeredAabb(viewport.x, viewport.y, playConfig.playAreaCols * cellSize, playConfig.playAreaRows * cellSize);
}
/** @param {import("../TileLabEditorState.js").TileLabEditorState["cavernConfig"]} cavernConfig */
export function getCavernBoundsPreview(cavernConfig) {
    return getCavernBoundsAabb(cavernConfig, gridSettings.cellSize);
}
/** @param {import("../state.js").TileLabGameState} state */
export function refreshLabMapBoundsPreview(state) {
    const cache = state.editor.mapBoundsPreview;
    const { viewport } = state;
    const { playConfig, cavernConfig, railConfig } = state.editor;
    const cellSize = gridSettings.cellSize;
    if (cache.playViewportX !== viewport.x || cache.playViewportY !== viewport.y || cache.playCols !== playConfig.playAreaCols || cache.playRows !== playConfig.playAreaRows) {
        cache.playViewportX = viewport.x;
        cache.playViewportY = viewport.y;
        cache.playCols = playConfig.playAreaCols;
        cache.playRows = playConfig.playAreaRows;
        centeredAabbInto(cache.playArea, viewport.x, viewport.y, playConfig.playAreaCols * cellSize, playConfig.playAreaRows * cellSize);
    }
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
    const wallCfg = state.editor.wallToolConfig;
    if (
        cache.wallMode !== wallCfg.boundsMode ||
        cache.wallCol !== wallCfg.boundsCol ||
        cache.wallRow !== wallCfg.boundsRow ||
        cache.wallCols !== wallCfg.boundsCols ||
        cache.wallRows !== wallCfg.boundsRows ||
        cache.wallCenterCol !== wallCfg.centerCol ||
        cache.wallCenterRow !== wallCfg.centerRow ||
        cache.wallOuterRadiusCells !== wallCfg.outerRadiusCells
    ) {
        cache.wallMode = wallCfg.boundsMode;
        cache.wallCol = wallCfg.boundsCol;
        cache.wallRow = wallCfg.boundsRow;
        cache.wallCols = wallCfg.boundsCols;
        cache.wallRows = wallCfg.boundsRows;
        cache.wallCenterCol = wallCfg.centerCol;
        cache.wallCenterRow = wallCfg.centerRow;
        cache.wallOuterRadiusCells = wallCfg.outerRadiusCells;
        getCellBoundsAabbInto(cache.wall, wallCfg, cellSize);
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
        if (cellIsStaticWallAtIdx(grid, idx) && (!grid.segmentGrid || !grid.segmentGrid[idx]?.length)) {
            grid.grid[idx] = 0;
            const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
            state.staticCellHealth.delete(packCellKey(globalCol, globalRow));
            cellChanged = true;
        }
        for (let side = 0; side < 4; side++)
            if (grid.edgeGrid[idx * 4 + side] !== 0) {
                grid.writeCellEdge(col, row, side, 0, 0);
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
/** @param {import("../state.js").TileLabGameState} state @param {import("../../Math/Aabb2D.js").Aabb2D | null} [extraAabb] */
export function ensureLabObstacleGridCoverage(state, extraAabb = null) {
    const cellSize = gridSettings.cellSize;
    let required = getCavernBoundsPreview(state.editor.cavernConfig);
    if (extraAabb) required = unionAabb(required, extraAabb);
    if (state.walls.length) required = unionAabb(required, computeBoundsFromWalls(state.walls, cellSize));
    required = padAabb(required, cellSize);
    const grid = state.obstacleGrid;
    const expanded = grid.expandToCoverAabb(required);
    if (!grid.segmentGrid) {
        grid.segmentGrid = new Array(grid.cols * grid.rows);
        for (const wall of state.walls) grid.addWall(wall);
    } else if (expanded) {
        grid.segmentGrid = new Array(grid.cols * grid.rows);
        for (const wall of state.walls) grid.addWall(wall);
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
    const stampBounds = getCavernBoundsPreview(cavernConfig);
    /** @type {{ originCol: number, originRow: number, cols: number, rows: number, cells: Uint8Array }} */
    let stamp = null;
    withSeededRandom(state.mapSeed, () => {
        stamp = generateCavernOccupancy(cavernConfig);
    });
    ensureLabObstacleGridCoverage(state);
    clearSandboxWallsInBounds(state, stampBounds);
    const level = clampStampWallHeightLevel(cavernConfig.wallHeightLevel, state.worldSurfaces.settings);
    const damageBounds = state.obstacleGrid.stampStaticWalls(stamp.originCol, stamp.originRow, stamp.cols, stamp.rows, stamp.cells, state.wallSpatialIndex, { additive: true, heightLevel: level });
    if (cavernConfig.boundsMode === "donut") {
        const innerR = getCavernInnerRadiusCells(cavernConfig) * cellSize;
        const center = getCavernCenterWorld(cavernConfig, cellSize);
        clearStaticWallsInWorldCircle(state, center.x, center.y, innerR);
    }
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    state.navigation.onObstaclesChanged(damageBounds);
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
    rebuildLabMapCaches(state);
}
/** @param {import("../state.js").TileLabGameState} state */
export function generateLabRailCaverns(state) {
    const { railConfig } = state.editor;
    const cellSize = gridSettings.cellSize;
    const stampBounds = getCellBoundsAabb(railConfig, cellSize);
    /** @type {{ originCol: number, originRow: number, cols: number, rows: number, cells: Uint8Array }} */
    let stamp = null;
    withSeededRandom(state.mapSeed, () => {
        stamp = generateCavernOccupancy(railConfig);
    });
    ensureLabObstacleGridCoverage(state, stampBounds);
    clearSandboxWallsInBounds(state, stampBounds);
    const level = clampStampWallHeightLevel(railConfig.wallHeightLevel, state.worldSurfaces.settings);
    const thickness = railConfig.edgeThickness ?? 2;
    const grid = state.obstacleGrid;
    const { originCol, originRow, cols, rows, cells } = stamp;
    const { col: baseCol, row: baseRow } = grid.worldToGrid(originCol * cellSize, originRow * cellSize);
    const startCol = Math.max(0, baseCol);
    const endCol = Math.min(grid.cols - 1, baseCol + cols - 1);
    const startRow = Math.max(0, baseRow);
    const endRow = Math.min(grid.rows - 1, baseRow + rows - 1);
    for (let r = startRow; r <= endRow; r++)
        for (let c = startCol; c <= endCol; c++) {
            const idx = c + r * grid.cols;
            if (grid.grid[idx] !== 0 && (!grid.segmentGrid || !grid.segmentGrid[idx]?.length)) {
                grid.grid[idx] = 0;
                const { globalCol, globalRow } = gridCellToGlobalColRow(grid, c, r);
                state.staticCellHealth.delete(packCellKey(globalCol, globalRow));
            }
            for (let side = 0; side < 4; side++) grid.writeCellEdge(c, r, side, 0, 0);
        }
    const stampSize = rows * cols;
    for (let i = 0; i < stampSize; i++) {
        if (cells[i] !== 1) continue;
        const lr = (i / cols) | 0;
        const lc = i % cols;
        const col = baseCol + lc;
        const row = baseRow + lr;
        if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) continue;
        for (let side = 0; side < 4; side++) {
            let nc = lc;
            let nr = lr;
            if (side === 0) nr = lr - 1;
            else if (side === 1) nc = lc + 1;
            else if (side === 2) nr = lr + 1;
            else if (side === 3) nc = lc - 1;
            let neighborVal = 0;
            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                neighborVal = cells[nr * cols + nc];
            }
            if (neighborVal === 0) {
                grid.writeCellEdge(col, row, side, level, thickness);
            }
        }
    }
    grid.bumpWallGridRevision();
    const damageBounds = { startCol, endCol, startRow, endRow };
    if (railConfig.boundsMode === "donut") {
        const innerR = getCavernInnerRadiusCells(railConfig) * cellSize;
        const center = getCavernCenterWorld(railConfig, cellSize);
        clearStaticWallsInWorldCircle(state, center.x, center.y, innerR);
    }
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    state.navigation.onObstaclesChanged(damageBounds);
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
    rebuildLabMapCaches(state);
}
