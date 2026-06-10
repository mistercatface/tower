import { Segment } from "../../../Entities/Wall.js";
import { gridSettings } from "../../../Config/Config.js";
import { bakeMapPathDebugCache } from "../../../Libraries/Render/map/MapPathDebugCache.js";
import { buildTopologyMapRenderCaches } from "../../../Libraries/Render/map/MapRenderCache.js";
import { finalizeGeneratedWorld } from "../../../Libraries/WorldGen/finalizeGeneratedWorld.js";
import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { sandboxController } from "./tilelabSandbox.js";
export const labCavernConfig = { halfWidth: 1600, halfHeight: 1600, fillChance: 0.45, iterations: 3 };
function generateCavernWalls(centerX, centerY, { halfWidth, halfHeight, fillChance, iterations }) {
    const cellSize = gridSettings.cellSize;
    const minX = centerX - halfWidth;
    const minY = centerY - halfHeight;
    const maxX = centerX + halfWidth;
    const maxY = centerY + halfHeight;
    const caMinX = Math.floor(minX / cellSize) * cellSize;
    const caMinY = Math.floor(minY / cellSize) * cellSize;
    const caMaxX = Math.ceil(maxX / cellSize) * cellSize;
    const caMaxY = Math.ceil(maxY / cellSize) * cellSize;
    const cols = (caMaxX - caMinX) / cellSize;
    const rows = (caMaxY - caMinY) / cellSize;
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
    return walls;
}
function rebuildLabMapCaches(state) {
    buildTopologyMapRenderCaches(state);
    state.mapPathDebugCache = bakeMapPathDebugCache(state);
}
/** @param {import("../state.js").TileLabGameState} state */
export function generateLabCaverns(state) {
    const centerX = state.viewport.x;
    const centerY = state.viewport.y;
    withSeededRandom(state.mapSeed, () => {
        state.walls = generateCavernWalls(centerX, centerY, labCavernConfig);
        state.wallSpatialIndex.clear();
        for (const wall of state.walls) state.wallSpatialIndex.insert(wall);
    });
    finalizeGeneratedWorld(state, { centerX, centerY });
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
    rebuildLabMapCaches(state);
    sandboxController?.clearBodies();
}
