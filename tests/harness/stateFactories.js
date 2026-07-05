import { createKineticSession } from "../../GameState/KineticSession.js";
import { WorldObstacleGrid } from "../../Libraries/Spatial/spatial.js";
import { createWorkerNavigation } from "../WorkerNavigationFactory.js";

export async function createNavWalkableTestState(config) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, config.boundsCols * 16, config.boundsRows * 16);
    const nav = await createWorkerNavigation(grid);
    return { obstacleGrid: grid, editor: { cavernConfig: config }, sandbox: {}, nav };
}

export function createRailStampTestState(grid) {
    return { obstacleGrid: grid, worldSurfaces: { settings: { maxWallHeightLevel: 4 } } };
}

export function createSurfaceBakeTestState(overrides = {}) {
    const obstacleGrid = {
        cols: overrides.cols ?? 8,
        rows: overrides.rows ?? 8,
        minX: overrides.minX ?? 0,
        minY: overrides.minY ?? 0,
        cellSize: overrides.cellSize ?? 16,
        collectStaticStructureZLevels: () => [0],
        worldCol: () => 0,
        worldRow: () => 0,
    };
    return { obstacleGrid };
}

export function createKineticAdmitTestState() {
    return { entityRegistry: { membershipGen: 1 }, kinetic: createKineticSession() };
}
