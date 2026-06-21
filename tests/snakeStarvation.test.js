import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getOrderedChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { getSnakeChainRadius } from "../Libraries/Game/snake/snakeScale.js";
import { createSnakeMetabolism, feedSnakeMetabolism, getSnakeHunger, setSnakeHunger, tickSnakeMetabolism } from "../Libraries/Game/snake/snakeStarvation.js";
import { wireSnakeGameForHead, createWiredSnakeAutosim, spawnSnakeFoodShardAtCell } from "./harness/snakeGameHarness.js";
import { FRAME_MS } from "./frameMs.js";
import { createDirectGroundNavBehavior } from "../Libraries/Sandbox/groundNav/directGroundNavBehavior.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";
import { createWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
loadPropAssets();
async function createTestState(cols = 32, rows = 32) {
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
    };
}
function chainOptions(segmentCount) {
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
const META = { hungerDrainMs: 30_000, foodValue: 0.5, growthCost: 1.0, starveShedIntervalMs: 10_000 };
function autosimBehaviors(state) {
    return new Map([
        [HPA_GROUND_NAV_BEHAVIOR_ID, createHpaGroundNavBehavior(state)],
        [DIRECT_GROUND_NAV_BEHAVIOR_ID, createDirectGroundNavBehavior(state)],
    ]);
}
describe("snake metabolism", () => {
    it("setSnakeHunger clamps and getSnakeHunger reads the bar", () => {
        const m = createSnakeMetabolism();
        assert.equal(getSnakeHunger(m), 1);
        setSnakeHunger(m, 0.5);
        assert.equal(getSnakeHunger(m), 0.5);
        setSnakeHunger(m, 2);
        assert.equal(getSnakeHunger(m), 1);
        setSnakeHunger(m, -1);
        assert.equal(getSnakeHunger(m), 0);
    });
    it("eating refills hunger first, then spills overflow into growth", () => {
        applySnakeGameConfig({ metabolism: META });
        const m = createSnakeMetabolism();
        setSnakeHunger(m, 0.2);
        assert.equal(feedSnakeMetabolism(m), 0);
        assert.equal(getSnakeHunger(m), 0.7);
        setSnakeHunger(m, 1);
        assert.equal(feedSnakeMetabolism(m), 0);
        assert.equal(feedSnakeMetabolism(m), 1);
        assert.equal(getSnakeHunger(m), 1);
    });
    it("drains hunger to empty then sheds a segment per starve interval", async () => {
        applySnakeGameConfig({ metabolism: META, minAliveSegmentCount: 3, startRadius: 2 });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(5));
        const headId = chain.head.id;
        const radiusBefore = getSnakeChainRadius(state, headId);
        const m = createSnakeMetabolism();
        setSnakeHunger(m, 0);
        assert.ok(tickSnakeMetabolism(state, headId, m, 10_000));
        assert.equal(getOrderedChainMemberIds(state, headId).length, 4);
        assert.equal(getSnakeChainRadius(state, headId), radiusBefore);
        assert.equal(getSnakeHunger(m), 0);
    });
    it("stays starving across sheds instead of bouncing to satisfied", async () => {
        applySnakeGameConfig({ metabolism: META, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(6));
        const headId = chain.head.id;
        const m = createSnakeMetabolism();
        setSnakeHunger(m, 0);
        assert.ok(tickSnakeMetabolism(state, headId, m, 10_000));
        assert.equal(getOrderedChainMemberIds(state, headId).length, 5);
        assert.equal(getSnakeHunger(m), 0);
        assert.ok(tickSnakeMetabolism(state, headId, m, 10_000));
        assert.equal(getOrderedChainMemberIds(state, headId).length, 4);
        assert.equal(getSnakeHunger(m), 0);
    });
    it("a starved min-length snake reads desperate (hunger 0), not satisfied", async () => {
        applySnakeGameConfig({ metabolism: META, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(3));
        const headId = chain.head.id;
        const m = createSnakeMetabolism();
        setSnakeHunger(m, 0);
        assert.equal(tickSnakeMetabolism(state, headId, m, 30_000), false);
        assert.equal(getOrderedChainMemberIds(state, headId).length, 3);
        assert.equal(getSnakeHunger(m), 0);
    });
    it("sprinting drains hunger faster and sheds sooner", async () => {
        applySnakeGameConfig({ metabolism: META, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(5));
        const headId = chain.head.id;
        const m = createSnakeMetabolism();
        setSnakeHunger(m, 0);
        assert.equal(tickSnakeMetabolism(state, headId, m, 5_000, null, 1), false);
        assert.equal(getOrderedChainMemberIds(state, headId).length, 5);
        assert.ok(tickSnakeMetabolism(state, headId, m, 5_000, null, 2.5));
        assert.equal(getOrderedChainMemberIds(state, headId).length, 4);
    });
    it("eating refills the hunger bar via autosim", async () => {
        applySnakeGameConfig({ metabolism: META, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(4));
        wireSnakeGameForHead(state, chain.head.id, chain.spawnGroupId);
        const food = spawnSnakeFoodShardAtCell(state, { col: 14, row: 8 });
        const autosim = createWiredSnakeAutosim(state, { headId: chain.head.id, behaviorById: autosimBehaviors(state), eatRadius: 20, rng: () => 0 });
        autosim.start();
        autosim.tick(10_000);
        assert.ok(autosim.getFoodTimerFraction() < 1);
        chain.head.x = food.x;
        chain.head.y = food.y;
        autosim.tick(FRAME_MS);
        assert.ok(autosim.getFoodTimerFraction() > 0.99);
    });
    it("overfeeding grows a new segment via autosim", async () => {
        applySnakeGameConfig({ metabolism: { ...META, foodValue: 1.5 }, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(3));
        wireSnakeGameForHead(state, chain.head.id, chain.spawnGroupId);
        const food = spawnSnakeFoodShardAtCell(state, { col: 14, row: 8 }, { foodValue: 1.5 });
        const autosim = createWiredSnakeAutosim(state, { headId: chain.head.id, behaviorById: autosimBehaviors(state), eatRadius: 20, rng: () => 0 });
        autosim.start();
        chain.head.x = food.x;
        chain.head.y = food.y;
        autosim.tick(FRAME_MS);
        assert.equal(getOrderedChainMemberIds(state, chain.head.id).length, 4);
    });
    it("does not shed on the same frame as eating", async () => {
        applySnakeGameConfig({ metabolism: META, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(4));
        wireSnakeGameForHead(state, chain.head.id, chain.spawnGroupId);
        const food = spawnSnakeFoodShardAtCell(state, { col: 14, row: 8 });
        const autosim = createWiredSnakeAutosim(state, { headId: chain.head.id, behaviorById: autosimBehaviors(state), eatRadius: 20, rng: () => 0, initialFoodFraction: 0 });
        autosim.start();
        const radiusBefore = getSnakeChainRadius(state, chain.head.id);
        chain.head.x = food.x;
        chain.head.y = food.y;
        autosim.tick(FRAME_MS);
        assert.equal(getOrderedChainMemberIds(state, chain.head.id).length, 4);
        assert.equal(getSnakeChainRadius(state, chain.head.id), radiusBefore);
    });
});
