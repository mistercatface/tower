import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { createDirectGroundNavBehavior } from "../Libraries/Sandbox/groundNav/directGroundNavBehavior.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";
import { createSnakeForageIntent } from "../Libraries/AI/agentIntent/createSnakeForageIntent.js";
import { createSnakeAutosim, createSnakeBrain } from "../Libraries/Game/snake/snakeAutosim.js";
import { FRAME_MS } from "./frameMs.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing, applySnakeHeadGameplay } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnGoalOrbAtCell } from "../Libraries/Game/snake/snakeScene.js";
import { createSnakeLifecycleRegistry, registerAliveSnake, wireSnakeGameRegistry } from "../Libraries/Game/snake/snakeLifecycle.js";
import { resolveSnakeExploreCell } from "../Libraries/Game/snake/snakeExplore.js";
import { wireSnakeGameForHead, createWiredSnakeAutosim, snakeGameNavWalkable, createSnakeNavWalkable } from "./harness/snakeGameHarness.js";
import { createWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { beginSnakePerceptionFrame } from "../Libraries/Game/snake/snakePerception.js";

loadPropAssets();

async function createFsmTestState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    const cavernConfig = createDefaultMapGenBoundsConfig();
    cavernConfig.boundsCol = 0;
    cavernConfig.boundsRow = 0;
    cavernConfig.boundsCols = cols;
    cavernConfig.boundsRows = rows;
    const navigation = await createWorkerNavigation(grid);
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        nav: navigation,
        viewport: { circleInBounds() { return true; } },
    };
}

function stampWall(grid, col, row) {
    grid.grid[colRowToIndex(col, row, grid.cols)] = 1;
}

function snakeBehaviors(state) {
    return new Map([
        [HPA_GROUND_NAV_BEHAVIOR_ID, createHpaGroundNavBehavior(state)],
        [DIRECT_GROUND_NAV_BEHAVIOR_ID, createDirectGroundNavBehavior(state)],
    ]);
}

function chainOptions(segmentCount = getSnakeGameConfig().segmentCount) {
    const config = getSnakeGameConfig();
    return {
        segmentCount,
        spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
        segmentRadius: config.startRadius,
        linkSlack: config.linkSlack,
        ballType: config.segmentPropId,
        headBallType: config.headPropId,
        growDirX: config.growDirX,
        growDirY: config.growDirY,
    };
}

function mockHeadNav() {
    let dest = null;
    let hasRoute = true;
    let replanPending = false;
    return {
        setDestination(grid, col, row) {
            dest = { col, row, world: grid.gridToWorld(col, row) };
            return true;
        },
        clearDestination() {
            dest = null;
        },
        clear() {
            dest = null;
        },
        getDestination() {
            return dest;
        },
        needsRetry() {
            if (!dest) return true;
            if (replanPending) return false;
            return !hasRoute;
        },
        replan() {},
        tick() {},
        getStatus() {
            return { hasDest: dest != null, destCol: dest?.col, destRow: dest?.row, hasRoute, replanPending, stuckFrames: 0, pathLen: hasRoute ? 3 : 0 };
        },
        setHasRoute(value) {
            hasRoute = value;
        },
    };
}

function createMockIntent(state, selfHeadId, registry) {
    const navWalkable = snakeGameNavWalkable(state);
    const headNav = mockHeadNav();
    const head = state.entityRegistry.getLive(selfHeadId);
    applySnakeHeadGameplay(head);
    const { brain, sync } = createSnakeBrain();
    const intent = createSnakeForageIntent({
        brain,
        sync,
        headNav,
        resolveVisibleFood: () => null,
        resolveExploreCell: (seeker, gameState, memory, exploreRng) => resolveSnakeExploreCell(seeker, gameState, memory, exploreRng, navWalkable),
        selfHeadId,
        registry,
        navWalkable,
        rng: () => 0,
    });
    return { intent, headNav };
}

describe("snake FSM transitions", () => {
    it("explore transitions to seek_food when food enters vision", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const chain = spawnLinkedBallChain(state, { col: 4, row: 8 }, chainOptions());
        wireSnakeGameForHead(state, chain.head.id);
        spawnGoalOrbAtCell(state, { col: 7, row: 8 });
        spawnGoalOrbAtCell(state, { col: 14, row: 8 });
        stampWall(state.obstacleGrid, 5, 8);
        stampWall(state.obstacleGrid, 6, 8);
        stampWall(state.obstacleGrid, 7, 8);
        stampWall(state.obstacleGrid, 8, 8);
        const autosim = createWiredSnakeAutosim(state, { headId: chain.head.id, behaviorById: snakeBehaviors(state), eatRadius: 20, rng: () => 0 });
        autosim.start();
        assert.equal(autosim.getMode(), "explore");
        chain.head.x = state.obstacleGrid.gridToWorld(10, 8).x;
        chain.head.y = state.obstacleGrid.gridToWorld(10, 8).y;
        autosim.tick(FRAME_MS);
        assert.equal(autosim.getMode(), "seek_food");
        assert.equal(autosim.getLastTransitionReason(), "mode_seek_food");
        assert.ok(autosim.getDestination());
    });

    it("seek_food transitions to flee when a larger snake appears", async () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const small = spawnLinkedBallChain(state, { col: 6, row: 10 }, chainOptions(3));
        const large = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(5));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, small.head.id);
        registerAliveSnake(registry, large.head.id);
        wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
        spawnGoalOrbAtCell(state, { col: 8, row: 10 });
        small.head.facing = 0;
        large.head.x = small.head.x + 200;
        large.head.y = small.head.y;
        const autosim = createWiredSnakeAutosim(state, { headId: small.head.id, behaviorById: snakeBehaviors(state), rng: () => 0 });
        autosim.start();
        assert.equal(autosim.getMode(), "seek_food");
        large.head.x = small.head.x + 80;
        autosim.tick(FRAME_MS);
        assert.equal(autosim.getMode(), "flee");
        assert.equal(autosim.getLastTransitionReason(), "threat_visible");
    });

    it("flee chains to a new retreat cell on arrival while threat remains visible", async () => {
        applySnakeGameConfig({ fleeRange: 128, fleeTiles: 2 });
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const small = spawnLinkedBallChain(state, { col: 24, row: 20 }, chainOptions(3));
        const large = spawnLinkedBallChain(state, { col: 28, row: 20 }, chainOptions(5));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, small.head.id);
        registerAliveSnake(registry, large.head.id);
        wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
        large.head.x = small.head.x + 64;
        large.head.y = small.head.y;
        const { intent } = createMockIntent(state, small.head.id, registry);
        const seeker = small.head;
        const grid = state.obstacleGrid;
        beginSnakePerceptionFrame(state);
        intent.perceive(seeker, state);
        intent.transition(seeker, state);
        assert.equal(intent.getMode(), "flee");
        const latched = intent.getDestination();
        assert.ok(latched);
        const world = grid.gridToWorld(latched.col, latched.row);
        seeker.x = world.x;
        seeker.y = world.y;
        large.head.x = seeker.x + 64;
        large.head.y = seeker.y;
        beginSnakePerceptionFrame(state);
        intent.perceive(seeker, state);
        intent.transition(seeker, state);
        assert.equal(intent.getMode(), "flee");
        assert.equal(intent.getLastTransitionReason(), "flee_continue");
        const next = intent.getDestination();
        assert.ok(next);
        assert.notDeepEqual(next, latched);
    });

    it("route failure retries the same latched cell", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions());
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, chain.head.id);
        wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
        const { intent, headNav } = createMockIntent(state, chain.head.id, registry);
        const seeker = chain.head;
        beginSnakePerceptionFrame(state);
        intent.perceive(seeker, state);
        intent.transition(seeker, state);
        intent.headNav.tick(seeker, 0);
        const latched = intent.getDestination();
        assert.ok(latched);
        headNav.setHasRoute(false);
        beginSnakePerceptionFrame(state);
        intent.perceive(seeker, state);
        intent.transition(seeker, state);
        assert.equal(intent.getLastTransitionReason(), "route_failed_retry");
        assert.deepEqual(intent.getDestination(), latched);
    });

    it("createSnakeAutosim requires a wired registry", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions());
        const stubNavWalkable = { cells: () => [], has: () => false, pick: () => null, filterInBounds: () => [], rebake: () => {} };
        assert.throws(() => createSnakeAutosim(state, { headId: chain.head.id, navWalkable: stubNavWalkable }), /registry/);
    });
});
