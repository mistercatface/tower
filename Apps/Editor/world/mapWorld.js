import { gridSettings } from "../../../Config/Config.js";
import { rebuildLabMapCaches } from "../../../Libraries/Render/map/labMapCaches.js";
import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { fillRandomGrid, runCellularAutomata } from "../../../Libraries/CA/index.js";
import { centeredAabb, centeredAabbInto, padAabb, unionAabb } from "../../../Libraries/Math/Aabb2D.js";
import { worldBoundsFromCellOrigin, forEachObstacleGridCellInAabb } from "../../../Libraries/Spatial/grid/GridCoords.js";
import { colRowToIndex } from "../../../Libraries/Spatial/grid/GridUtils.js";
import { computeBoundsFromWalls } from "../../../Libraries/Spatial/grid/wallGridBake.js";
import { clearSandboxWallsInBounds } from "../../../Libraries/Sandbox/spawnAssembly.js";
import { resolveStampWallHeight } from "../../../Libraries/WorldSurface/stampWallHeight.js";
import { appendStaticOccupancyLayer, cellIsStaticBlocked, gridCellToGlobalColRow, patchStaticOccupancyCell } from "../../../Libraries/World/staticOccupancyLayers.js";
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
import { getCellBoundsAabbInto } from "./cellBoundsConfig.js";
export { getCavernBoundsAabb, centerCavernBoundsOnViewport, syncCavernSizeFromPlayArea };
export const PLAY_AREA_CELL_OPTIONS = [64, 128, 256, 512, 1024];
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
    const { playConfig, cavernConfig } = state.editor;
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
function clearStaticOccupancyInWorldCircle(state, centerWorldX, centerWorldY, radiusWorld) {
    const grid = state.obstacleGrid;
    if (!grid?.cols || radiusWorld <= 0) return;
    const aabb = { minX: centerWorldX - radiusWorld, minY: centerWorldY - radiusWorld, maxX: centerWorldX + radiusWorld, maxY: centerWorldY + radiusWorld };
    let startCol = Infinity;
    let endCol = -1;
    let startRow = Infinity;
    let endRow = -1;
    forEachObstacleGridCellInAabb(grid, aabb, (col, row) => {
        const bounds = grid.getCellBounds(col, row);
        const cx = (bounds.minX + bounds.maxX) * 0.5;
        const cy = (bounds.minY + bounds.maxY) * 0.5;
        if (Math.hypot(cx - centerWorldX, cy - centerWorldY) >= radiusWorld) return;
        if (!cellIsStaticBlocked(grid, col, row)) return;
        const idx = colRowToIndex(col, row, grid.cols);
        if (grid.segmentGrid?.[idx]?.length) return;
        grid.grid[idx] = 0;
        const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
        patchStaticOccupancyCell(state, globalCol, globalRow, 0);
        state.staticCellHealth.delete(`${globalCol},${globalRow}`);
        if (col < startCol) startCol = col;
        if (col > endCol) endCol = col;
        if (row < startRow) startRow = row;
        if (row > endRow) endRow = row;
    });
    if (startCol === Infinity) return;
    const damageBounds = { startCol, endCol, startRow, endRow };
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    state.navigation.onObstaclesChanged(damageBounds);
}
/** @param {import("../state.js").TileLabGameState} state @param {import("../../Math/Aabb2D.js").Aabb2D | null} [extraAabb] */
export function ensureLabObstacleGridCoverage(state, extraAabb = null) {
    const cellSize = gridSettings.cellSize;
    let required = getCavernBoundsPreview(state.editor.cavernConfig);
    if (extraAabb) required = unionAabb(required, extraAabb);
    for (const layer of state.staticOccupancyLayers ?? []) required = unionAabb(required, worldBoundsFromCellOrigin(layer.originCol, layer.originRow, layer.cols, layer.rows, cellSize));
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
        state.worldSurfaces.renderScene.setGridOrigin(grid.minX, grid.minY);
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
    const wallHeight = resolveStampWallHeight(cavernConfig.wallHeightLevel, cellSize);
    const damageBounds = state.obstacleGrid.stampStaticOccupancy(stamp.originCol, stamp.originRow, stamp.cols, stamp.rows, stamp.cells, state.wallSpatialIndex, { additive: true });
    appendStaticOccupancyLayer(state, { originCol: stamp.originCol, originRow: stamp.originRow, cols: stamp.cols, rows: stamp.rows, wallHeight, cells: stamp.cells });
    if (cavernConfig.boundsMode === "donut") {
        const innerR = getCavernInnerRadiusCells(cavernConfig) * cellSize;
        const center = getCavernCenterWorld(cavernConfig, cellSize);
        clearStaticOccupancyInWorldCircle(state, center.x, center.y, innerR);
    }
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    state.navigation.onObstaclesChanged(damageBounds);
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
    rebuildLabMapCaches(state);
}
