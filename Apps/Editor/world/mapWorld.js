import { gridSettings } from "../../../Config/Config.js";
import { rebuildLabMapCaches } from "../../../Libraries/Render/map/labMapCaches.js";
import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { fillRandomGrid, runCellularAutomata } from "../../../Libraries/CA/index.js";
import { centeredAabb, centeredAabbInto, padAabb, unionAabb } from "../../../Libraries/Math/Aabb2D.js";
import { worldBoundsFromCellOrigin, worldBoundsFromCellOriginInto } from "../../../Libraries/Spatial/grid/GridCoords.js";
import { computeBoundsFromWalls } from "../../../Libraries/Spatial/grid/wallGridBake.js";
import { clearSandboxWallsInBounds } from "../../../Libraries/Sandbox/spawnAssembly.js";
import { resolveStampWallHeight } from "../../../Libraries/WorldSurface/stampWallHeight.js";
import { appendStaticOccupancyLayer } from "../../../Libraries/World/staticOccupancyLayers.js";
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
/** @param {import("../state.js").TileLabGameState["labCavernConfig"]} cavernConfig */
export function getCavernBoundsPreview(cavernConfig) {
    return worldBoundsFromCellOrigin(cavernConfig.boundsCol, cavernConfig.boundsRow, cavernConfig.boundsCols, cavernConfig.boundsRows, gridSettings.cellSize);
}
/** @param {import("../state.js").TileLabGameState} state */
export function refreshLabMapBoundsPreview(state) {
    const cache = state.labMapBoundsPreview;
    const { viewport, labPlayConfig, labCavernConfig } = state;
    const cellSize = gridSettings.cellSize;
    if (cache.playViewportX !== viewport.x || cache.playViewportY !== viewport.y || cache.playCols !== labPlayConfig.playAreaCols || cache.playRows !== labPlayConfig.playAreaRows) {
        cache.playViewportX = viewport.x;
        cache.playViewportY = viewport.y;
        cache.playCols = labPlayConfig.playAreaCols;
        cache.playRows = labPlayConfig.playAreaRows;
        centeredAabbInto(cache.playArea, viewport.x, viewport.y, labPlayConfig.playAreaCols * cellSize, labPlayConfig.playAreaRows * cellSize);
    }
    if (
        cache.cavernCol !== labCavernConfig.boundsCol ||
        cache.cavernRow !== labCavernConfig.boundsRow ||
        cache.cavernCols !== labCavernConfig.boundsCols ||
        cache.cavernRows !== labCavernConfig.boundsRows
    ) {
        cache.cavernCol = labCavernConfig.boundsCol;
        cache.cavernRow = labCavernConfig.boundsRow;
        cache.cavernCols = labCavernConfig.boundsCols;
        cache.cavernRows = labCavernConfig.boundsRows;
        worldBoundsFromCellOriginInto(cache.cavern, labCavernConfig.boundsCol, labCavernConfig.boundsRow, labCavernConfig.boundsCols, labCavernConfig.boundsRows, cellSize);
    }
}
/**
 * @param {import("../state.js").TileLabGameState["viewport"]} viewport
 * @param {import("../state.js").TileLabGameState["labPlayConfig"]} playConfig
 * @param {import("../state.js").TileLabGameState["labCavernConfig"]} cavernConfig
 * @param {{ center?: boolean, syncSizeFromPlay?: boolean }} [options]
 */
export function syncCavernBoundsFromPlay(viewport, playConfig, cavernConfig, { center = true, syncSizeFromPlay = false } = {}) {
    if (syncSizeFromPlay) {
        cavernConfig.boundsCols = playConfig.playAreaCols;
        cavernConfig.boundsRows = playConfig.playAreaRows;
    }
    if (!center) return;
    const cellSize = gridSettings.cellSize;
    const minX = viewport.x - (cavernConfig.boundsCols * cellSize) / 2;
    const minY = viewport.y - (cavernConfig.boundsRows * cellSize) / 2;
    cavernConfig.boundsCol = Math.round(minX / cellSize);
    cavernConfig.boundsRow = Math.round(minY / cellSize);
}
/** @param {import("../state.js").TileLabGameState} state */
function ensureLabObstacleGridCoverage(state) {
    const cellSize = gridSettings.cellSize;
    let required = getCavernBoundsPreview(state.labCavernConfig);
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
/** @param {import("../state.js").TileLabGameState["labCavernConfig"]} config @returns {{ originCol: number, originRow: number, cols: number, rows: number, cells: Uint8Array }} */
function generateCavernOccupancy(config) {
    const cols = Math.max(1, Math.round(config.boundsCols));
    const rows = Math.max(1, Math.round(config.boundsRows));
    let cells = fillRandomGrid(cols, rows, config.fillChance);
    cells = runCellularAutomata(cols, rows, cells, { iterations: config.iterations, scratch: new Uint8Array(cols * rows) });
    return { originCol: config.boundsCol, originRow: config.boundsRow, cols, rows, cells };
}
/** @param {import("../state.js").TileLabGameState} state */
export function generateLabCaverns(state) {
    const { labCavernConfig } = state;
    const stampBounds = getCavernBoundsPreview(labCavernConfig);
    /** @type {{ originCol: number, originRow: number, cols: number, rows: number, cells: Uint8Array }} */
    let stamp = null;
    withSeededRandom(state.mapSeed, () => {
        stamp = generateCavernOccupancy(labCavernConfig);
    });
    ensureLabObstacleGridCoverage(state);
    clearSandboxWallsInBounds(state, stampBounds);
    const wallHeight = resolveStampWallHeight(labCavernConfig.wallHeightLevel, gridSettings.cellSize);
    const damageBounds = state.obstacleGrid.stampStaticOccupancy(stamp.originCol, stamp.originRow, stamp.cols, stamp.rows, stamp.cells, state.wallSpatialIndex, { additive: true });
    appendStaticOccupancyLayer(state, { originCol: stamp.originCol, originRow: stamp.originRow, cols: stamp.cols, rows: stamp.rows, wallHeight, cells: stamp.cells });
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    state.navigation.onObstaclesChanged(damageBounds);
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
    rebuildLabMapCaches(state);
}
