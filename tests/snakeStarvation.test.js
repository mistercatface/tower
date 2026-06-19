import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getOrderedChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { getSnakeChainRadius, stepSnakeChainRadius } from "../Libraries/Game/snake/snakeScale.js";
import { createSnakeFoodTimer, getSnakeFoodTimerFraction, tickSnakeFoodTimer } from "../Libraries/Game/snake/snakeStarvation.js";
import { createSnakeAutosim } from "../Libraries/Game/snake/snakeAutosim.js";
import { wireSnakeGameForHead } from "./harness/snakeGameHarness.js";
import { createDirectGroundNavBehavior } from "../Libraries/Sandbox/groundNav/directGroundNavBehavior.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";
import { spawnGoalOrbAtCell } from "../Libraries/Game/snake/snakeScene.js";
loadPropAssets();
function createTestState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    const cavernConfig = createDefaultMapGenBoundsConfig();
    cavernConfig.boundsCol = 0;
    cavernConfig.boundsRow = 0;
    cavernConfig.boundsCols = cols;
    cavernConfig.boundsRows = rows;
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        navigation: { settings: {}, onObstaclesChanged: async () => {} },
        hpaPathWorker: { getPathSlot: () => null, releaseOwnedPathSlot: () => {} },
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
describe("snake starvation", () => {
    it("tickSnakeFoodTimer sheds tail and shrinks radius after interval", () => {
        applySnakeGameConfig({ starvationIntervalSec: 30, minAliveSegmentCount: 3, radiusPerMeal: 0.25, startRadius: 2 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(5));
        const headId = chain.head.id;
        stepSnakeChainRadius(state, headId);
        stepSnakeChainRadius(state, headId);
        const timer = createSnakeFoodTimer(30);
        timer.remainingSec = 0.1;
        assert.ok(tickSnakeFoodTimer(state, headId, timer, 0.2));
        assert.equal(getOrderedChainMemberIds(state, headId).length, 4);
        assert.ok(getSnakeChainRadius(state, headId) < 2.5);
        assert.ok(timer.remainingSec > 29);
    });
    it("does not shrink below minAliveSegmentCount", () => {
        applySnakeGameConfig({ starvationIntervalSec: 30, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(3));
        const headId = chain.head.id;
        const timer = createSnakeFoodTimer(30);
        timer.remainingSec = -1;
        assert.equal(tickSnakeFoodTimer(state, headId, timer, 0), false);
        assert.equal(getOrderedChainMemberIds(state, headId).length, 3);
        assert.equal(timer.remainingSec, 30);
    });
    it("eating resets food timer via autosim", () => {
        applySnakeGameConfig({ starvationIntervalSec: 30, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(4));
        wireSnakeGameForHead(state, chain.head.id);
        const goal = spawnGoalOrbAtCell(state, { col: 14, row: 8 });
        const behaviorById = new Map([
            [HPA_GROUND_NAV_BEHAVIOR_ID, createHpaGroundNavBehavior(state)],
            [DIRECT_GROUND_NAV_BEHAVIOR_ID, createDirectGroundNavBehavior(state)],
        ]);
        const autosim = createSnakeAutosim(state, { headId: chain.head.id, goalPropId: goal.id, behaviorById, eatRadius: 20, rng: () => 0 });
        autosim.start();
        autosim.tick(10);
        assert.ok(autosim.getFoodTimerFraction() < 1);
        chain.head.x = goal.x;
        chain.head.y = goal.y;
        autosim.tick(1 / 60);
        assert.ok(autosim.getFoodTimerFraction() > 0.99);
    });
    it("does not shed on the same frame as eating", () => {
        applySnakeGameConfig({ starvationIntervalSec: 30, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, chainOptions(3));
        wireSnakeGameForHead(state, chain.head.id);
        const goal = spawnGoalOrbAtCell(state, { col: 14, row: 8 });
        const behaviorById = new Map([
            [HPA_GROUND_NAV_BEHAVIOR_ID, createHpaGroundNavBehavior(state)],
            [DIRECT_GROUND_NAV_BEHAVIOR_ID, createDirectGroundNavBehavior(state)],
        ]);
        const autosim = createSnakeAutosim(state, { headId: chain.head.id, goalPropId: goal.id, behaviorById, eatRadius: 20, rng: () => 0 });
        autosim.start();
        const radiusBefore = getSnakeChainRadius(state, chain.head.id);
        chain.head.x = goal.x;
        chain.head.y = goal.y;
        autosim.tick(1 / 60);
        assert.equal(getOrderedChainMemberIds(state, chain.head.id).length, 4);
        assert.ok(getSnakeChainRadius(state, chain.head.id) > radiusBefore);
    });
    it("getSnakeFoodTimerFraction tracks remaining time", () => {
        const timer = createSnakeFoodTimer(30);
        timer.remainingSec = 15;
        assert.equal(getSnakeFoodTimerFraction(timer), 0.5);
    });
});
