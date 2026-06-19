import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { createDirectGroundNavBehavior } from "../Libraries/Sandbox/groundNav/directGroundNavBehavior.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";
import { createSnakeAutosim, findSnakeGoalProp } from "../Libraries/Game/snake/snakeAutosim.js";
import { wireSnakeGameForHead } from "./harness/snakeGameHarness.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnGoalOrbAtCell } from "../Libraries/Game/snake/snakeScene.js";
import { getCirclePropRadius } from "../Libraries/Props/propScale.js";

loadPropAssets();

function createSnakeAutosimTestState(cols = 32, rows = 32) {
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

function snakeBehaviorById(state) {
    return new Map([
        [HPA_GROUND_NAV_BEHAVIOR_ID, createHpaGroundNavBehavior(state)],
        [DIRECT_GROUND_NAV_BEHAVIOR_ID, createDirectGroundNavBehavior(state)],
    ]);
}

function snakeChainOptions() {
    const config = getSnakeGameConfig();
    return {
        segmentCount: config.segmentCount,
        spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
        segmentRadius: config.startRadius,
        linkSlack: config.linkSlack,
        ballType: config.segmentPropId,
        headBallType: config.headPropId,
        growDirX: config.growDirX,
        growDirY: config.growDirY,
    };
}

describe("snakeAutosim", () => {
    it("eating the goal adds a chain segment and respawns the goal orb", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createSnakeAutosimTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, snakeChainOptions());
        wireSnakeGameForHead(state, chain.head.id);
        const goal = spawnGoalOrbAtCell(state, { col: 14, row: 10 });
        const behaviorById = snakeBehaviorById(state);
        const autosim = createSnakeAutosim(state, {
            headId: chain.head.id,
            goalPropId: goal.id,
            behaviorById,
            eatRadius: 20,
            rng: () => 0,
        });
        autosim.start();
        chain.head.x = goal.x;
        chain.head.y = goal.y;
        autosim.tick(1 / 60);
        assert.equal(state.sandbox.kineticConstraints.length, 3);
        assert.equal(getChainMemberIds(state, chain.head.id).length, 4);
        assert.equal(countLiveGoalOrbs(state), 1);
        assert.notEqual(findSnakeGoalProp(state)?.id, goal.id);
    });

    it("eating scales the chain before adding the new segment", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createSnakeAutosimTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, snakeChainOptions());
        wireSnakeGameForHead(state, chain.head.id);
        const goal = spawnGoalOrbAtCell(state, { col: 14, row: 10 });
        const behaviorById = snakeBehaviorById(state);
        const autosim = createSnakeAutosim(state, {
            headId: chain.head.id,
            goalPropId: goal.id,
            behaviorById,
            eatRadius: 20,
            rng: () => 0,
        });
        autosim.start();
        chain.head.x = goal.x;
        chain.head.y = goal.y;
        autosim.tick(1 / 60);
        const members = getChainMemberIds(state, chain.head.id).map((id) => state.entityRegistry.getLive(id));
        for (let i = 0; i < members.length; i++) assert.equal(getCirclePropRadius(members[i]), 2.25);
    });

    it("re-issues HPA nav toward a respawned goal", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createSnakeAutosimTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, snakeChainOptions());
        wireSnakeGameForHead(state, chain.head.id);
        const goal = spawnGoalOrbAtCell(state, { col: 12, row: 8 });
        const behaviorById = snakeBehaviorById(state);
        const hpaBehavior = behaviorById.get(HPA_GROUND_NAV_BEHAVIOR_ID);
        const autosim = createSnakeAutosim(state, {
            headId: chain.head.id,
            goalPropId: goal.id,
            behaviorById,
            eatRadius: 20,
            rng: () => 0,
        });
        autosim.start();
        chain.head.x = goal.x;
        chain.head.y = goal.y;
        autosim.tick(1 / 60);
        const nextGoal = findSnakeGoalProp(state);
        autosim.tick(1 / 60);
        hpaBehavior.setMoveTarget(chain.head, { x: nextGoal.x, y: nextGoal.y });
        assert.ok(hpaBehavior.getPathOverlay(chain.head));
    });
});

function countLiveGoalOrbs(state) {
    let count = 0;
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead || prop.type !== getSnakeGameConfig().goalPropId) return;
        count++;
    });
    return count;
}
