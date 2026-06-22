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
import { createSnakeForageIntent } from "../Libraries/Game/snake/createSnakeForageIntent.js";
import { createSnakeAutosim, createSnakeBrain } from "../Libraries/Game/snake/snakeAutosim.js";
import { FRAME_MS } from "./frameMs.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing, applySnakeHeadGameplay } from "../Libraries/Game/snake/snakeGameConfig.js";
import { getPropVisualTint } from "../Libraries/Color/visualOverride.js";
import { SNAKE_INTENT_MODE_TINT, SNAKE_SATISFIED_EXPLORE_TINT } from "../Libraries/Game/snake/snakeChainColor.js";
import { createSnakeAgentSession, registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { SNAKE_GAME_SPECIES } from "../Libraries/Game/snake/species/index.js";
import { resolveSnakeExploreCell } from "../Libraries/Game/snake/snakeExplore.js";
import { createSeekIntentState } from "../Libraries/AI/agentIntent/intentStates.js";
import { wireSnakeGameForHead, createWiredSnakeAutosim, snakeGameNavWalkable, createSnakeNavWalkable, wireSnakeTestGame, spawnSnakeFoodShardAtCell } from "./harness/snakeGameHarness.js";
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
        viewport: {
            circleInBounds() {
                return true;
            },
        },
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
function assertChainTint(chain, tint) {
    for (const prop of chain.members) assert.equal(getPropVisualTint(prop), tint);
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
        updateTerminalTarget() {
            return false;
        },
        needsRetry() {
            if (!dest) return true;
            if (replanPending) return false;
            return false;
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
    it("holds same-target seek route while updating same-cell terminal target", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 32 * 16, 32 * 16);
        const cell = grid.gridToWorld(8, 8);
        const state = createSeekIntentState();
        const calls = { seek: 0, hold: 0, update: 0 };
        const ctx = {
            agent: { id: "snake", x: cell.x, y: cell.y, radius: 2 },
            grid,
            target: { id: "food", x: cell.x - 2, y: cell.y },
            dest: { col: 8, row: 8, world: { x: cell.x - 6, y: cell.y }, lockOnTarget: true, targetId: "food" },
            ticks: 20,
            lastModeChangeTick: 0,
            locomotion: { hasArrivedAtDest: () => false },
            effects: {
                setSeekDestination() {
                    calls.seek++;
                },
                holdDestination() {
                    calls.hold++;
                },
                updateSeekTarget() {
                    calls.update++;
                },
                setLastTransition() {},
            },
        };
        state.update(ctx);
        assert.equal(calls.seek, 0);
        assert.equal(calls.hold, 1);
        assert.equal(calls.update, 1);
        ctx.target.x = cell.x + 7;
        state.update(ctx);
        assert.equal(calls.seek, 0);
        assert.equal(calls.hold, 2);
        assert.equal(calls.update, 2);
        const nextCell = grid.gridToWorld(9, 8);
        ctx.target.x = nextCell.x;
        ctx.target.y = nextCell.y;
        state.update(ctx);
        assert.equal(calls.seek, 1);
    });
    it("explore transitions to seek_prey when a smaller snake is visible", async () => {
        applySnakeGameConfig({ fleeRange: 128, showSnakeFsmDebug: true });
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const hunter = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(5));
        const prey = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        wireSnakeTestGame(state, [
            { headId: hunter.head.id, spawnGroupId: hunter.spawnGroupId },
            { headId: prey.head.id, spawnGroupId: prey.spawnGroupId },
        ]);
        hunter.head.facing = 0;
        prey.head.x = hunter.head.x + 64;
        prey.head.y = hunter.head.y;
        const autosim = createWiredSnakeAutosim(state, { headId: hunter.head.id, behaviorById: snakeBehaviors(state), rng: () => 0, initialFoodFraction: 0.5 });
        autosim.start();
        assert.equal(autosim.getMode(), "seek_prey");
        assertChainTint(hunter, SNAKE_INTENT_MODE_TINT.seek_prey);
        assert.equal(autosim.getLastTransitionReason(), "mode_seek_prey");
        const dest = autosim.getDestination();
        assert.equal(dest.col, 14);
        assert.equal(dest.row, 10);
        assert.deepEqual(dest.world, { x: prey.head.x, y: prey.head.y });
        assert.equal(dest.exactArrival, true);
        assert.equal(dest.lockOnTarget, true);
        assert.equal(dest.arrivalRadius, Math.max(2, hunter.head.radius * 0.25));
    });
    it("does not recolor the chain when FSM debug is disabled", async () => {
        applySnakeGameConfig({ fleeRange: 128, showSnakeFsmDebug: false });
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const hunter = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(5));
        const prey = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        wireSnakeTestGame(state, [
            { headId: hunter.head.id, spawnGroupId: hunter.spawnGroupId },
            { headId: prey.head.id, spawnGroupId: prey.spawnGroupId },
        ]);
        hunter.head.facing = 0;
        prey.head.x = hunter.head.x + 64;
        prey.head.y = hunter.head.y;
        const beforeTint = getPropVisualTint(hunter.head);
        const autosim = createWiredSnakeAutosim(state, { headId: hunter.head.id, behaviorById: snakeBehaviors(state), rng: () => 0, initialFoodFraction: 0.5 });
        autosim.start();
        assert.equal(autosim.getMode(), "seek_prey");
        assert.equal(getPropVisualTint(hunter.head), beforeTint);
    });
    it("explore transitions to seek_food when food enters vision", async () => {
        applySnakeGameConfig({ showSnakeFsmDebug: true });
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const chain = spawnLinkedBallChain(state, { col: 4, row: 8 }, chainOptions());
        wireSnakeGameForHead(state, chain.head.id, chain.spawnGroupId);
        spawnSnakeFoodShardAtCell(state, { col: 7, row: 8 });
        spawnSnakeFoodShardAtCell(state, { col: 14, row: 8 });
        stampWall(state.obstacleGrid, 5, 8);
        stampWall(state.obstacleGrid, 6, 8);
        stampWall(state.obstacleGrid, 7, 8);
        stampWall(state.obstacleGrid, 8, 8);
        const autosim = createWiredSnakeAutosim(state, { headId: chain.head.id, behaviorById: snakeBehaviors(state), eatRadius: 20, rng: () => 0 });
        autosim.start();
        assert.equal(autosim.getMode(), "explore");
        assertChainTint(chain, SNAKE_SATISFIED_EXPLORE_TINT);
        chain.head.x = state.obstacleGrid.gridToWorld(10, 8).x;
        chain.head.y = state.obstacleGrid.gridToWorld(10, 8).y;
        autosim.tick(FRAME_MS);
        assert.equal(autosim.getMode(), "seek_food");
        assertChainTint(chain, SNAKE_INTENT_MODE_TINT.seek_food);
        assert.equal(autosim.getLastTransitionReason(), "mode_seek_food");
        assert.equal(autosim.getDestination().arrivalRadius, 20);
        assert.equal(autosim.getDestination().lockOnTarget, true);
    });
    it("seek_prey transitions to flee when a larger snake appears", async () => {
        applySnakeGameConfig({ fleeRange: 128, showSnakeFsmDebug: true });
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const hunter = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(5));
        const prey = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        const threat = spawnLinkedBallChain(state, { col: 24, row: 10 }, chainOptions(7));
        wireSnakeTestGame(state, [
            { headId: hunter.head.id, spawnGroupId: hunter.spawnGroupId },
            { headId: prey.head.id, spawnGroupId: prey.spawnGroupId },
            { headId: threat.head.id, spawnGroupId: threat.spawnGroupId },
        ]);
        hunter.head.facing = 0;
        prey.head.x = hunter.head.x + 64;
        prey.head.y = hunter.head.y;
        threat.head.x = hunter.head.x + 200;
        threat.head.y = hunter.head.y;
        const autosim = createWiredSnakeAutosim(state, { headId: hunter.head.id, behaviorById: snakeBehaviors(state), rng: () => 0, initialFoodFraction: 0.5 });
        autosim.start();
        assert.equal(autosim.getMode(), "seek_prey");
        threat.head.x = hunter.head.x + 30;
        autosim.tick(FRAME_MS);
        assert.equal(autosim.getMode(), "flee");
        assertChainTint(hunter, SNAKE_INTENT_MODE_TINT.flee);
        assert.equal(autosim.getLastTransitionReason(), "threat_visible");
    });
    it("holds flee briefly after threat severity drops before returning to food", async () => {
        applySnakeGameConfig({ fleeRange: 128, fleeHysteresis: { minTicks: 35, exitThreatSeverity: 0.15, refreshAtSeverity: 0.35 } });
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const hunter = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(5));
        const threat = spawnLinkedBallChain(state, { col: 13, row: 10 }, chainOptions(7));
        wireSnakeTestGame(state, [
            { headId: hunter.head.id, spawnGroupId: hunter.spawnGroupId },
            { headId: threat.head.id, spawnGroupId: threat.spawnGroupId },
        ]);
        spawnSnakeFoodShardAtCell(state, { col: 12, row: 10 });
        hunter.head.facing = 0;
        threat.head.x = hunter.head.x + 30;
        threat.head.y = hunter.head.y;
        const autosim = createWiredSnakeAutosim(state, { headId: hunter.head.id, behaviorById: snakeBehaviors(state), rng: () => 0, initialFoodFraction: 0.5 });
        autosim.start();
        assert.equal(autosim.getMode(), "flee");
        threat.head.x = hunter.head.x + 120;
        for (let i = 0; i < 31; i++) autosim.tick(FRAME_MS);
        assert.equal(autosim.getMode(), "flee");
        assert.equal(autosim.getFsmSnapshot().decision.chosenIntent.reason, "flee_hysteresis");
        for (let i = 0; i < 6; i++) autosim.tick(FRAME_MS);
        assert.equal(autosim.getMode(), "seek_food");
    });
    it("seek_prey transitions to seek_food when prey is lost and food is visible", async () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const hunter = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(5));
        const prey = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        wireSnakeTestGame(state, [
            { headId: hunter.head.id, spawnGroupId: hunter.spawnGroupId },
            { headId: prey.head.id, spawnGroupId: prey.spawnGroupId },
        ]);
        hunter.head.facing = 0;
        prey.head.x = hunter.head.x + 64;
        prey.head.y = hunter.head.y;
        const autosim = createWiredSnakeAutosim(state, { headId: hunter.head.id, behaviorById: snakeBehaviors(state), rng: () => 0, initialFoodFraction: 0.5 });
        autosim.start();
        assert.equal(autosim.getMode(), "seek_prey");
        const food = spawnSnakeFoodShardAtCell(state, { col: 12, row: 10 });
        prey.head.isDead = true;
        autosim.tick(FRAME_MS);
        assert.equal(autosim.getMode(), "seek_food");
        assert.equal(autosim.getLastTransitionReason(), "target_lost");
        assert.equal(autosim.getDestination().col, state.obstacleGrid.worldToGrid(food.x, food.y).col);
    });
    it("keeps chasing last-seen prey briefly when LOS drops and food is visible", async () => {
        applySnakeGameConfig({ fleeRange: 128, intentMemory: { threatTtlTicks: 2, preyTtlTicks: 4, foodTtlTicks: 4 } });
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const hunter = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(5));
        const prey = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        wireSnakeTestGame(state, [
            { headId: hunter.head.id, spawnGroupId: hunter.spawnGroupId },
            { headId: prey.head.id, spawnGroupId: prey.spawnGroupId },
        ]);
        hunter.head.facing = 0;
        prey.head.x = hunter.head.x + 64;
        prey.head.y = hunter.head.y;
        const autosim = createWiredSnakeAutosim(state, { headId: hunter.head.id, behaviorById: snakeBehaviors(state), rng: () => 0, initialFoodFraction: 0.5 });
        autosim.start();
        assert.equal(autosim.getMode(), "seek_prey");
        const lastSeenDest = autosim.getDestination();
        spawnSnakeFoodShardAtCell(state, { col: 12, row: 10 });
        stampWall(state.obstacleGrid, 12, 10);
        autosim.tick(FRAME_MS);
        assert.equal(autosim.getMode(), "seek_prey");
        assert.equal(autosim.getTargetId(), prey.head.id);
        assert.deepEqual(autosim.getDestination(), lastSeenDest);
        const snapshot = autosim.getFsmSnapshot();
        const memory = snapshot.intentMemory;
        assert.equal(memory.prey.id, prey.head.id);
        assert.equal(memory.prey.ageTicks, 1);
        assert.equal(snapshot.decision.chosenIntent.mode, "seek_prey");
        assert.ok(snapshot.decision.events.includes("PREY_LAST_SEEN_ACTIVE"));
    });
    it("drops last-seen prey after memory expires and falls back to visible food", async () => {
        applySnakeGameConfig({ fleeRange: 128, intentMemory: { threatTtlTicks: 1, preyTtlTicks: 1, foodTtlTicks: 4 } });
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const hunter = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(5));
        const prey = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        wireSnakeTestGame(state, [
            { headId: hunter.head.id, spawnGroupId: hunter.spawnGroupId },
            { headId: prey.head.id, spawnGroupId: prey.spawnGroupId },
        ]);
        hunter.head.facing = 0;
        prey.head.x = hunter.head.x + 64;
        prey.head.y = hunter.head.y;
        const autosim = createWiredSnakeAutosim(state, { headId: hunter.head.id, behaviorById: snakeBehaviors(state), rng: () => 0, initialFoodFraction: 0.5 });
        autosim.start();
        assert.equal(autosim.getMode(), "seek_prey");
        const food = spawnSnakeFoodShardAtCell(state, { col: 14, row: 13 });
        stampWall(state.obstacleGrid, 12, 10);
        autosim.tick(FRAME_MS);
        assert.equal(autosim.getMode(), "seek_food");
        assert.equal(autosim.getLastTransitionReason(), "target_lost");
        assert.equal(autosim.getTargetId(), food.id);
    });
    it("seek_food transitions to flee when a larger snake appears", async () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const small = spawnLinkedBallChain(state, { col: 6, row: 10 }, chainOptions(3));
        const large = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(5));
        wireSnakeTestGame(state, [
            { headId: small.head.id, spawnGroupId: small.spawnGroupId },
            { headId: large.head.id, spawnGroupId: large.spawnGroupId },
        ]);
        spawnSnakeFoodShardAtCell(state, { col: 8, row: 10 });
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
        wireSnakeTestGame(state, [
            { headId: small.head.id, spawnGroupId: small.spawnGroupId },
            { headId: large.head.id, spawnGroupId: large.spawnGroupId },
        ]);
        const registry = state.sandbox.snakeGame.registry;
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
    it("route failure keeps the latched cell until nav gives up", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions());
        wireSnakeTestGame(state, [{ headId: chain.head.id, spawnGroupId: chain.spawnGroupId }]);
        const registry = state.sandbox.snakeGame.registry;
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
        assert.equal(intent.getLastTransitionReason(), "held_latch");
        assert.deepEqual(intent.getDestination(), latched);
    });
    it("a hunting snake sprints, scaling head speed (PR10)", async () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const hunter = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(5));
        const prey = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        wireSnakeTestGame(state, [
            { headId: hunter.head.id, spawnGroupId: hunter.spawnGroupId },
            { headId: prey.head.id, spawnGroupId: prey.spawnGroupId },
        ]);
        applySnakeHeadGameplay(hunter.head);
        hunter.head.facing = 0;
        prey.head.x = hunter.head.x + 64;
        prey.head.y = hunter.head.y;
        const baseSpeed = hunter.head.strategy.groundNav.maxSpeed;
        const autosim = createWiredSnakeAutosim(state, { headId: hunter.head.id, behaviorById: snakeBehaviors(state), rng: () => 0, initialFoodFraction: 0.5 });
        autosim.start();
        assert.equal(autosim.getMode(), "seek_prey");
        autosim.tick(FRAME_MS);
        assert.equal(autosim.isSprinting(), true);
        assert.equal(hunter.head.strategy.groundNav.maxSpeed, baseSpeed * getSnakeGameConfig().sprint.speedMultiplier);
    });
    it("a min-length snake never sprints, even fleeing a lethal threat (PR10)", async () => {
        applySnakeGameConfig({ fleeRange: 128, lethalThreatRange: 64 });
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const small = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const threat = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(7));
        wireSnakeTestGame(state, [
            { headId: small.head.id, spawnGroupId: small.spawnGroupId },
            { headId: threat.head.id, spawnGroupId: threat.spawnGroupId },
        ]);
        small.head.facing = 0;
        threat.head.x = small.head.x + 30;
        threat.head.y = small.head.y;
        const autosim = createWiredSnakeAutosim(state, { headId: small.head.id, behaviorById: snakeBehaviors(state), rng: () => 0, initialFoodFraction: 0.5 });
        autosim.start();
        assert.equal(autosim.getMode(), "flee");
        autosim.tick(FRAME_MS);
        assert.equal(autosim.isSprinting(), false);
    });
    it("createSnakeAutosim requires a wired registry", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions());
        const stubNavWalkable = { cells: () => [], has: () => false, pick: () => null, filterInBounds: () => [], rebake: () => {} };
        assert.throws(() => createSnakeAutosim(state, { headId: chain.head.id, navWalkable: stubNavWalkable }), /registry/);
    });
    it("satisfied snake ignores same-team smaller snake but hunts opposite-team smaller snake (Red vs Blue)", async () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = await createFsmTestState();
        // Spawn satisfied seeker (Red, length 5)
        const seeker = spawnLinkedBallChain(state, { col: 10, row: 10 }, { ...chainOptions(5), faction: "red" });
        // Spawn smaller same-team snake (Red, length 3)
        const ally = spawnLinkedBallChain(state, { col: 14, row: 10 }, { ...chainOptions(3), faction: "red" });
        // Spawn smaller opposite-team snake (Blue, length 3)
        const enemy = spawnLinkedBallChain(state, { col: 10, row: 14 }, { ...chainOptions(3), faction: "blue" });
        // Set faction explicitly on all heads
        seeker.head.faction = "red";
        ally.head.faction = "red";
        enemy.head.faction = "blue";
        const { snakeGame } = wireSnakeTestGame(state, [
            { headId: seeker.head.id, spawnGroupId: seeker.spawnGroupId },
            { headId: ally.head.id, spawnGroupId: ally.spawnGroupId },
            { headId: enemy.head.id, spawnGroupId: enemy.spawnGroupId },
        ]);
        // Position ally in front of seeker
        seeker.head.facing = 0;
        ally.head.x = seeker.head.x + 64;
        ally.head.y = seeker.head.y;
        // Position enemy far away initially
        enemy.head.x = seeker.head.x;
        enemy.head.y = seeker.head.y + 200;
        // Start seeker as fully satisfied (foodFraction = 1.0)
        const autosim = createWiredSnakeAutosim(state, { headId: seeker.head.id, behaviorById: snakeBehaviors(state), rng: () => 0, initialFoodFraction: 1.0 });
        // Set the seeker's faction explicitly on the head prop and instance
        seeker.head.faction = "red";
        state.sandbox.snakeGame.instancesByHeadId.get(seeker.head.id).faction = "red";
        // Set the ally and enemy factions explicitly on their head props and instances
        ally.head.faction = "red";
        state.sandbox.snakeGame.instancesByHeadId.get(ally.head.id).faction = "red";
        enemy.head.faction = "blue";
        state.sandbox.snakeGame.instancesByHeadId.get(enemy.head.id).faction = "blue";
        autosim.start();
        // Seeker should ignore same-team ally and explore instead of hunting
        assert.equal(autosim.getMode(), "explore");
        // Move enemy close to seeker
        enemy.head.x = seeker.head.x + 64;
        enemy.head.y = seeker.head.y;
        // Move ally away
        ally.head.x = seeker.head.x;
        ally.head.y = seeker.head.y + 200;
        // Tick to perceive the enemy
        autosim.tick(FRAME_MS);
        // Seeker should attack enemy snake no matter what, transitioning to seek_prey
        assert.equal(autosim.getMode(), "seek_prey");
        assert.equal(autosim.getDestination().targetId, enemy.head.id);
    });
});
