import { EntityRegistry } from "../../GameState/EntityRegistry.js";
import { createKineticSession } from "../../GameState/KineticSession.js";
import {
    buildReplanParams,
    buildNavReachableMaskFromSeed,
    buildNavComponentMap,
    createNavState,
    findNearestOpenCellIdx,
    patchNavWalkableCellIndex,
    snapNavGoalWorld,
    replanCellIndicesFromWorldCoords,
    REPLAN_PRIORITY_TARGET,
} from "../../Libraries/Navigation/navigation.js";
import { ENGINE_F32, N_OUT_XY } from "../../Core/engineMemory.js";
import { snapMoveTargetToCellCenter } from "../../Libraries/Physics/physics.js";
import { FloorBelt } from "../../Libraries/Spatial/belts.js";
import { SandboxWorldState } from "../../Libraries/Sandbox/sandbox.js";
import { runGameLaunch, GAME_LAUNCHERS } from "../../Libraries/Game/gameLaunch.js";
import {
    WorldObstacleGrid,
    createDefaultMapGenBoundsConfig,
    clearGridWallsBatch,
    cellIsStaticWall,
    isRailWallEdge,
    forEachGlobalCellInMapGenBounds,
    RailWallBatch,
} from "../../Libraries/Spatial/spatial.js";
import { createNavRuntime } from "../WorkerNavigationFactory.js";

const SNAKE_RAIL_MAZE_COLS = 64;
const SNAKE_RAIL_MAZE_ROWS = 64;
const CELLS_PER_CHUNK = 16;
let sessionReplanFrame = 1000;

export function mulberry32(seed) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function createSnakeEditorState(seed) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 512, 512);
    const session = { select() {}, sync() {} };
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: createKineticSession(),
        sandbox: {
            ...new SandboxWorldState(),
            controller: { session },
        },
        viewport: {
            x: 128,
            y: 128,
            zoom: 1.0,
            snapTo(x, y) {
                this.x = x;
                this.y = y;
            },
            setZoom(z) {
                this.zoom = z;
            },
            circleInBounds() {
                return true;
            },
        },
        worldSurfaces: {
            settings: { maxWallHeightLevel: 8, cellsPerChunk: CELLS_PER_CHUNK },
            clearBakeCache() {},
            invalidateGridBounds() {},
        },
        editor: {
            cavernConfig: createDefaultMapGenBoundsConfig(),
            railConfig: createDefaultMapGenBoundsConfig(),
            railMazeConfig: {
                ...createDefaultMapGenBoundsConfig(),
                wallHeightLevel: 1,
                edgeThickness: 1,
                corridorWidthMin: 1,
                corridorWidthMax: 2,
                extraLinkRatio: 0.25,
                surfaceProfileId: "cyberGrid",
            },
            eraseConfig: createDefaultMapGenBoundsConfig(),
            lockSelection: false,
        },
        nav: createNavRuntime(grid),
        mapSeed: seed,
        stressSeed: seed,
        _breakableWalls: null,
    };
}

function collectBreakableWalls(state) {
    const grid = state.obstacleGrid;
    const config = state.editor.railMazeConfig;
    const voxels = [];
    const rails = [];
    forEachGlobalCellInMapGenBounds(grid, config, (idx) => {
        if (cellIsStaticWall(grid, idx)) voxels.push(idx);
        for (let side = 0; side < 4; side++) {
            if (isRailWallEdge(grid.getCellEdge(idx, side))) rails.push({ idx, side });
        }
    });
    return { voxels, rails };
}

export async function createSnakeNavStressState(seed) {
    const state = createSnakeEditorState(seed);
    state.appLaunch = { id: "snake", launcher: GAME_LAUNCHERS.snake };
    const ctx = await runGameLaunch(state, GAME_LAUNCHERS.snake);
    state.nav.setNavWalkableSyncHook((damageBounds) => patchNavWalkableCellIndex(state, damageBounds));
    return { state, boid: ctx.boid, portalPair: ctx.portalPair };
}

export function assertSnakeLaunchReady(state) {
    const grid = state.obstacleGrid;
    const config = state.editor.railMazeConfig;
    if (config.boundsCols !== SNAKE_RAIL_MAZE_COLS || config.boundsRows !== SNAKE_RAIL_MAZE_ROWS) {
        throw new Error(`snake maze size mismatch: ${config.boundsCols}x${config.boundsRows}`);
    }
    if (config.edgeThickness !== 4) throw new Error(`snake edgeThickness mismatch: ${config.edgeThickness}`);
    if (grid.floorBeltCount <= 0) throw new Error("snake maze has no corridor belts");
    if (grid.activePortalCount <= 0) throw new Error("snake maze has no portal pair");
}

export function boidOpenCellIdx(state, prop) {
    const grid = state.obstacleGrid;
    const idx = grid.worldToIdx(prop.x, prop.y);
    if (idx < 0) return -1;
    return findNearestOpenCellIdx(grid.grid, grid, idx);
}

export function pickRandomReachableTargetWorld(state, startIdx, rng, prop) {
    const grid = state.obstacleGrid;
    const topology = state.nav.topology.topology;
    const octileNeighbors = topology?.octileNeighbors;
    const blocked = topology?.blocked ?? grid.grid;
    if (!octileNeighbors || !prop || startIdx < 0) return null;
    let propIdx = grid.worldToIdx(prop.x, prop.y);
    if (propIdx < 0) propIdx = 0;
    const replanStart = findNearestOpenCellIdx(grid.grid, grid, propIdx);
    const mask = buildNavReachableMaskFromSeed(blocked, octileNeighbors, grid.cols, grid.rows, replanStart, grid.activePortalPairs, grid.activePortalCount);
    const reachable = [];
    for (let idx = 0; idx < mask.length; idx++) {
        if (idx === replanStart) continue;
        if (mask[idx]) reachable.push(idx);
    }
    if (!reachable.length) return null;
    const pickOrder = reachable.length;
    const first = (rng() * pickOrder) | 0;
    for (let attempt = 0; attempt < pickOrder; attempt++) {
        const clickIdx = reachable[(first + attempt) % pickOrder];
        snapMoveTargetToCellCenter(ENGINE_F32, N_OUT_XY, grid, grid.gridCenterXByIdx(clickIdx), grid.gridCenterYByIdx(clickIdx));
        const moveX = ENGINE_F32[N_OUT_XY];
        const moveY = ENGINE_F32[N_OUT_XY + 1];
        const replan = replanCellIndicesFromWorldCoords(grid, prop.x, prop.y, moveX, moveY);
        if (!mask[replan.targetIdx]) continue;
        return {
            idx: replan.targetIdx,
            clickIdx,
            onBelt: FloorBelt.isBeltAtIdx(grid, clickIdx),
            worldX: replan.steerX,
            worldY: replan.steerY,
            moveX,
            moveY,
        };
    }
    return null;
}

export function moveStressBoidToTarget(prop, targetWorld) {
    prop.x = targetWorld.moveX ?? targetWorld.worldX;
    prop.y = targetWorld.moveY ?? targetWorld.worldY;
}

async function awaitWorkerReplan(state, navState, request) {
    const nav = state.nav;
    await nav.awaitWorkerNavReady();
    const workerOut = await nav.worker.requestPath(request, navState);
    request.applyResult(navState, nav.worker, workerOut?.result ?? null);
    if (workerOut?.result?.pathLen > 0) nav.worker.releaseSlot(workerOut.result.pathSlot);
    return navState.pathLen;
}

export async function awaitSessionReplan(state, navState, request, priority = REPLAN_PRIORITY_TARGET) {
    const nav = state.nav;
    await nav.awaitWorkerNavReady();
    nav.session.beginFrame(sessionReplanFrame++);
    const accepted = nav.session.requestReplan(navState, request, priority);
    if (!accepted) throw new Error("session replan rejected (frame cooldown?)");
    nav.session.flushFrame();
    while (navState.hpaReplanRequestId !== 0) {
        await new Promise((r) => setImmediate(r));
        nav.session.flushFrame();
    }
    return navState.pathLen;
}

export async function requestSnakeGroundNavReplan(state, prop, targetWorld) {
    const grid = state.obstacleGrid;
    const nav = state.nav;
    const navState = createNavState();
    navState.pendingReplanReason = "targetChange";
    const request = buildReplanParams(grid, prop.x, prop.y, targetWorld.moveX ?? targetWorld.worldX, targetWorld.moveY ?? targetWorld.worldY, nav, state);
    return awaitWorkerReplan(state, navState, request);
}

export async function requestSnakeSessionNavReplan(state, prop, targetWorld) {
    const grid = state.obstacleGrid;
    const nav = state.nav;
    const navState = createNavState();
    navState.pendingReplanReason = "targetChange";
    const request = buildReplanParams(grid, prop.x, prop.y, targetWorld.moveX ?? targetWorld.worldX, targetWorld.moveY ?? targetWorld.worldY, nav, state);
    return awaitSessionReplan(state, navState, request);
}

export async function breakRandomWall(state, rng) {
    if (!state._breakableWalls) state._breakableWalls = collectBreakableWalls(state);
    const { voxels, rails } = state._breakableWalls;
    const total = voxels.length + rails.length;
    if (total === 0) return false;
    let pick = (rng() * total) | 0;
    if (pick < voxels.length) {
        const idx = voxels[pick];
        voxels.splice(pick, 1);
        clearGridWallsBatch(state, { voxels: [idx] });
        return true;
    }
    pick -= voxels.length;
    const rail = rails[pick];
    rails.splice(pick, 1);
    clearGridWallsBatch(state, { rails: RailWallBatch.single(rail.idx, rail.side) });
    return true;
}

export function formatReplanFailureDiagnostics(state, ctx) {
    const grid = state.obstacleGrid;
    const topology = state.nav.topology.topology;
    const blocked = topology?.blocked ?? grid.grid;
    const octileNeighbors = topology?.octileNeighbors;
    const { seed, step, startIdx, targetIdx, targetWorld, clickIdx } = ctx;
    let maskReachable = false;
    let startComp = null;
    let targetComp = null;
    if (octileNeighbors && startIdx >= 0 && targetIdx >= 0) {
        const mask = buildNavReachableMaskFromSeed(blocked, octileNeighbors, grid.cols, grid.rows, startIdx, grid.activePortalPairs, grid.activePortalCount);
        maskReachable = mask[targetIdx] !== 0;
        const cellToComponent = buildNavComponentMap(blocked, octileNeighbors, grid.cols, grid.rows, grid.activePortalPairs, grid.activePortalCount);
        startComp = cellToComponent[startIdx];
        targetComp = cellToComponent[targetIdx];
    }
    const cellToRegion = state.nav.worker.graphCellToRegion;
    const startRegion = cellToRegion && startIdx >= 0 ? cellToRegion[startIdx] : -1;
    const targetRegion = cellToRegion && targetIdx >= 0 ? cellToRegion[targetIdx] : -1;
    const prop = ctx.prop;
    if (prop && targetWorld) snapNavGoalWorld(ENGINE_F32, N_OUT_XY, grid, prop.x, prop.y, targetWorld.worldX, targetWorld.worldY);
    const steerX = prop && targetWorld ? ENGINE_F32[N_OUT_XY] : 0;
    const steerY = prop && targetWorld ? ENGINE_F32[N_OUT_XY + 1] : 0;
    return [
        `HPA replan failed for oracle-reachable target (seed=${seed} step=${step})`,
        `startIdx=${startIdx} targetIdx=${targetIdx} clickIdx=${clickIdx ?? targetWorld?.clickIdx} targetOnBelt=${FloorBelt.isBeltAtIdx(grid, clickIdx ?? targetIdx)}`,
        `prop=(${prop?.x}, ${prop?.y}) steerTarget=(${steerX}, ${steerY})`,
        `clickTarget=(${targetWorld?.worldX}, ${targetWorld?.worldY})`,
        `maskReachable=${maskReachable} startComp=${startComp} targetComp=${targetComp}`,
        `startRegion=${startRegion} targetRegion=${targetRegion}`,
        `graphSyncGeneration=${state.nav.graphSyncGeneration} topologyKey=${state.nav.syncedTopologyKey()}`,
        `portalCount=${grid.activePortalCount} beltCount=${grid.floorBeltCount}`,
    ].join("\n");
}

export function stressStepsFromEnv(defaultSteps) {
    const raw = process.env.NAV_STRESS_STEPS;
    if (!raw) return defaultSteps;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n | 0 : defaultSteps;
}

export function stressSeedsFromEnv(defaultSeeds) {
    const raw = process.env.NAV_STRESS_SEEDS;
    if (!raw) return defaultSeeds;
    return raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
}
