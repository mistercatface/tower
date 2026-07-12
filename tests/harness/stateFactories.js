import { createKineticSession } from "../../Libraries/Physics/physics.js";
import { FractureEngine } from "../../Libraries/Physics/fracture.js";
import { WorldObstacleGrid } from "../../Libraries/Spatial/spatial.js";
import { SandboxWorldState } from "../../Libraries/Sandbox/sandbox.js";
import { EntityRegistry } from "../../GameState/EntityRegistry.js";
import { createWorkerNavigation } from "../WorkerNavigationFactory.js";

export function createSandboxSessionState(overrides = {}) {
    return {
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig: overrides.cavernConfig ?? null, navWalkableCellsCache: null },
        simulationFrameHooks: null,
        ...overrides,
    };
}

export async function createNavWalkableTestState(config) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, config.boundsCols * 16, config.boundsRows * 16);
    const nav = await createWorkerNavigation(grid);
    return {
        obstacleGrid: grid,
        editor: { cavernConfig: config, navWalkableCellsCache: null },
        sandbox: new SandboxWorldState(),
        nav,
    };
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
    const world = { entityRegistry: { membershipGen: 1 }, kinetic: createKineticSession() };
    world.fractureEngine = new FractureEngine(world);
    return world;
}

export function createSandboxKineticWorld(cols = 32, rows = 32, overrides = {}) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    const world = {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: createKineticSession(),
        sandbox: new SandboxWorldState(),
        ...overrides,
    };
    world.fractureEngine = new FractureEngine(world);
    return world;
}
