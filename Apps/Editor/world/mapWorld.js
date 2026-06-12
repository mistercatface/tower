import { Segment } from "../../../Entities/Wall.js";
import { gridSettings } from "../../../Config/Config.js";
import { rebuildLabMapCaches } from "../../../Libraries/Render/map/labMapCaches.js";
import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { fillRandomGrid, runCellularAutomata } from "../../../Libraries/CA/index.js";
import { aabbContains, centeredAabb, centeredAabbInto, padAabb, unionAabb } from "../../../Libraries/Math/Aabb2D.js";
import { worldBoundsFromCellOrigin, worldBoundsFromCellOriginInto } from "../../../Libraries/Spatial/grid/GridCoords.js";
import { computeBoundsFromWalls } from "../../../Libraries/Spatial/grid/wallGridBake.js";
import { addSandboxWalls, clearSandboxWallsInBounds } from "../../../Libraries/Sandbox/spawnAssembly.js";
import { resolveStampWallHeight } from "../../../Libraries/WorldSurface/stampWallHeight.js";
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
 * @param {{ center?: boolean }} [options] When false, only sync cols/rows from play area.
 */
export function syncCavernBoundsFromPlay(viewport, playConfig, cavernConfig, { center = true } = {}) {
    cavernConfig.boundsCols = playConfig.playAreaCols;
    cavernConfig.boundsRows = playConfig.playAreaRows;
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
    let required = getPlayAreaPreviewBounds(state.viewport, state.labPlayConfig);
    required = unionAabb(required, getCavernBoundsPreview(state.labCavernConfig));
    if (state.walls.length) required = unionAabb(required, computeBoundsFromWalls(state.walls, cellSize));
    required = padAabb(required, cellSize);
    const grid = state.obstacleGrid;
    if (grid.cols > 0 && aabbContains(grid, required) && grid.segmentGrid) return;
    const width = required.maxX - required.minX;
    const height = required.maxY - required.minY;
    const centerX = (required.minX + required.maxX) / 2;
    const centerY = (required.minY + required.maxY) / 2;
    grid.rebuildFixed(centerX, centerY, width, height);
    grid.segmentGrid = new Array(grid.cols * grid.rows);
    for (const wall of state.walls) grid.addWall(wall);
    state.hierarchicalNavigator.initialize(centerX, centerY);
    state.worldSurfaces.renderScene.setGridOrigin(grid.minX, grid.minY);
}
/** @param {import("../state.js").TileLabGameState["labCavernConfig"]} config */
function generateCavernWalls(config) {
    const cellSize = gridSettings.cellSize;
    const cols = Math.max(1, Math.round(config.boundsCols));
    const rows = Math.max(1, Math.round(config.boundsRows));
    const { minX: caMinX, minY: caMinY } = worldBoundsFromCellOrigin(config.boundsCol, config.boundsRow, cols, rows, cellSize);
    let grid = fillRandomGrid(cols, rows, config.fillChance);
    grid = runCellularAutomata(cols, rows, grid, { iterations: config.iterations, scratch: new Uint8Array(cols * rows) });
    const wallHeight = resolveStampWallHeight(config.wallHeightLevel, cellSize);
    const walls = [];
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            if (grid[r * cols + c] !== 1) continue;
            walls.push(new Segment(caMinX + c * cellSize + cellSize / 2, caMinY + r * cellSize + cellSize / 2, 0, cellSize, 0, 30, 30, false, wallHeight));
        }
    return walls;
}
/** @param {import("../state.js").TileLabGameState} state */
export function generateLabCaverns(state) {
    const { labCavernConfig } = state;
    const stampBounds = getCavernBoundsPreview(labCavernConfig);
    let newWalls = [];
    withSeededRandom(state.mapSeed, () => {
        newWalls = generateCavernWalls(labCavernConfig);
    });
    ensureLabObstacleGridCoverage(state);
    clearSandboxWallsInBounds(state, stampBounds);
    addSandboxWalls(state, newWalls);
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
    rebuildLabMapCaches(state);
}
