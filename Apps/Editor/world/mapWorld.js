import { Segment } from "../../../Entities/Wall.js";
import { gridSettings } from "../../../Config/Config.js";
import { rebuildLabMapCaches } from "../../../Libraries/Render/map/labMapCaches.js";
import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { fillRandomGrid, runCellularAutomata } from "../../../Libraries/CA/index.js";
import { computeBoundsFromWalls } from "../../../Libraries/Spatial/grid/wallGridBake.js";
import { addSandboxWalls, clearSandboxWallsInBounds } from "../../../Libraries/Sandbox/spawnAssembly.js";
export const PLAY_AREA_CELL_OPTIONS = [64, 128, 256, 512, 1024];
/** @param {number} cells */
export function playAreaCellsToIndex(cells) {
    const index = PLAY_AREA_CELL_OPTIONS.indexOf(cells);
    return index >= 0 ? index : PLAY_AREA_CELL_OPTIONS.indexOf(256);
}
/** @param {{ playAreaCols: number, playAreaRows: number }} playConfig */
function playAreaWorldSize(playConfig) {
    const cellSize = gridSettings.cellSize;
    return { width: playConfig.playAreaCols * cellSize, height: playConfig.playAreaRows * cellSize };
}
/** @param {import("../state.js").TileLabGameState["viewport"]} viewport @param {{ playAreaCols: number, playAreaRows: number }} playConfig */
export function getPlayAreaPreviewBounds(viewport, playConfig) {
    const { width, height } = playAreaWorldSize(playConfig);
    return { minX: viewport.x - width / 2, minY: viewport.y - height / 2, maxX: viewport.x + width / 2, maxY: viewport.y + height / 2 };
}
/** @param {import("../state.js").TileLabGameState["labCavernConfig"]} cavernConfig */
export function getCavernBoundsPreview(cavernConfig) {
    const cellSize = gridSettings.cellSize;
    const minX = cavernConfig.boundsCol * cellSize;
    const minY = cavernConfig.boundsRow * cellSize;
    return { minX, minY, maxX: minX + cavernConfig.boundsCols * cellSize, maxY: minY + cavernConfig.boundsRows * cellSize };
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
/** @param {{ minX: number, minY: number, maxX: number, maxY: number }} a @param {{ minX: number, minY: number, maxX: number, maxY: number }} b */
function mergeWorldBounds(a, b) {
    return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}
/** @param {import("../state.js").TileLabGameState} state */
function ensureLabObstacleGridCoverage(state) {
    const cellSize = gridSettings.cellSize;
    let required = getPlayAreaPreviewBounds(state.viewport, state.labPlayConfig);
    required = mergeWorldBounds(required, getCavernBoundsPreview(state.labCavernConfig));
    if (state.walls.length) {
        const wallBounds = computeBoundsFromWalls(state.walls, cellSize);
        required = mergeWorldBounds(required, { minX: wallBounds.minX, minY: wallBounds.minY, maxX: wallBounds.maxX, maxY: wallBounds.maxY });
    }
    const pad = cellSize;
    required = { minX: required.minX - pad, minY: required.minY - pad, maxX: required.maxX + pad, maxY: required.maxY + pad };
    const grid = state.obstacleGrid;
    if (grid.cols > 0 && grid.minX <= required.minX && grid.minY <= required.minY && grid.maxX >= required.maxX && grid.maxY >= required.maxY && grid.segmentGrid) return;
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
    const caMinX = config.boundsCol * cellSize;
    const caMinY = config.boundsRow * cellSize;
    let grid = fillRandomGrid(cols, rows, config.fillChance);
    grid = runCellularAutomata(cols, rows, grid, { iterations: config.iterations, scratch: new Uint8Array(cols * rows) });
    const walls = [];
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            if (grid[r * cols + c] !== 1) continue;
            walls.push(new Segment(caMinX + c * cellSize + cellSize / 2, caMinY + r * cellSize + cellSize / 2, 0, cellSize, 0));
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
