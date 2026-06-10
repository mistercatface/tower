import { Segment } from "../../../Entities/Wall.js";
import { gridSettings } from "../../../Config/Config.js";
import { bakeMapPathDebugCache } from "../../../Libraries/Render/map/MapPathDebugCache.js";
import { buildTopologyMapRenderCaches } from "../../../Libraries/Render/map/MapRenderCache.js";
import { finalizeGeneratedWorld } from "../../../Libraries/WorldGen/finalizeGeneratedWorld.js";
import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { sandboxController } from "./tilelabSandbox.js";
export const PLAY_AREA_CELL_OPTIONS = [64, 128, 256, 512, 1024, 2048, 4096];
export const labCavernConfig = { playAreaCols: 256, playAreaRows: 256, fillChance: 0.45, iterations: 3 };
/** @param {number} cells */
export function playAreaCellsToIndex(cells) {
    const index = PLAY_AREA_CELL_OPTIONS.indexOf(cells);
    return index >= 0 ? index : PLAY_AREA_CELL_OPTIONS.indexOf(256);
}
function generateCavernWalls(centerX, centerY, { playAreaCols, playAreaRows, fillChance, iterations }) {
    const cellSize = gridSettings.cellSize;
    const width = playAreaCols * cellSize;
    const height = playAreaRows * cellSize;
    const caMinX = centerX - width / 2;
    const caMinY = centerY - height / 2;
    const cols = playAreaCols;
    const rows = playAreaRows;
    let grid = new Uint8Array(cols * rows);
    for (let i = 0; i < grid.length; i++) if (Math.random() < fillChance) grid[i] = 1;
    let nextGrid = new Uint8Array(cols * rows);
    for (let iter = 0; iter < iterations; iter++) {
        for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++) {
                let wallsCount = 0;
                for (let dr = -1; dr <= 1; dr++)
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                            if (grid[nr * cols + nc] === 1) wallsCount++;
                        } else wallsCount++;
                    }
                nextGrid[r * cols + c] = wallsCount >= 5 ? 1 : 0;
            }
        const temp = grid;
        grid = nextGrid;
        nextGrid = temp;
    }
    const walls = [];
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            if (grid[r * cols + c] !== 1) continue;
            walls.push(new Segment(caMinX + c * cellSize + cellSize / 2, caMinY + r * cellSize + cellSize / 2, 0, cellSize, 0));
        }
    return { walls, width, height };
}
function rebuildLabMapCaches(state) {
    buildTopologyMapRenderCaches(state);
    state.mapPathDebugCache = bakeMapPathDebugCache(state);
}
/** @param {import("../state.js").TileLabGameState} state */
export function generateLabCaverns(state) {
    const centerX = state.viewport.x;
    const centerY = state.viewport.y;
    const { playAreaCols, playAreaRows } = labCavernConfig;
    let playWidth = playAreaCols * gridSettings.cellSize;
    let playHeight = playAreaRows * gridSettings.cellSize;
    withSeededRandom(state.mapSeed, () => {
        const result = generateCavernWalls(centerX, centerY, labCavernConfig);
        state.walls = result.walls;
        playWidth = result.width;
        playHeight = result.height;
        state.wallSpatialIndex.clear();
        for (const wall of state.walls) state.wallSpatialIndex.insert(wall);
    });
    finalizeGeneratedWorld(state, { centerX, centerY, gridBounds: { centerX, centerY, width: playWidth, height: playHeight } });
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
    rebuildLabMapCaches(state);
    sandboxController?.clearBodies();
}
