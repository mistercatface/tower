import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry, visitLiveWorldProps } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
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
import { FRAME_MS } from "./frameMs.js";
import { wireSnakeGameForHead, createWiredSnakeAutosim } from "./harness/snakeGameHarness.js";
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
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        nav: { settings: {}, commitEdit: async () => {}, topologyKey: () => "", syncedTopologyKey: () => "", graphSyncGeneration: 0, worker: { getPathSlot: () => null, releaseOwnedPathSlot: () => {} }, session: { isReplanInFlight: () => false }, topology: null },
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
        const autosim = createWiredSnakeAutosim(state, {
            headId: chain.head.id,
            goalPropId: goal.id,
            behaviorById,
            eatRadius: 20,
            rng: () => 0,
        });
        autosim.start();
        chain.head.x = goal.x;
        chain.head.y = goal.y;
        autosim.tick(FRAME_MS);
        assert.equal(state.kinetic.kineticConstraints.length, 3);
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
        const autosim = createWiredSnakeAutosim(state, {
            headId: chain.head.id,
            goalPropId: goal.id,
            behaviorById,
            eatRadius: 20,
            rng: () => 0,
        });
        autosim.start();
        chain.head.x = goal.x;
        chain.head.y = goal.y;
        autosim.tick(FRAME_MS);
        const members = getChainMemberIds(state, chain.head.id).map((id) => state.entityRegistry.getLive(id));
        for (let i = 0; i < members.length; i++) assert.equal(getCirclePropRadius(members[i]), 2.25);
    });

    it("re-issues nav toward a respawned goal", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createSnakeAutosimTestState();
        const chain = spawnLinkedBallChain(state, { col: 8, row: 8 }, snakeChainOptions());
        wireSnakeGameForHead(state, chain.head.id);
        const goal = spawnGoalOrbAtCell(state, { col: 12, row: 8 });
        const autosim = createWiredSnakeAutosim(state, {
            headId: chain.head.id,
            goalPropId: goal.id,
            eatRadius: 20,
            rng: () => 0,
        });
        autosim.start();
        chain.head.x = goal.x;
        chain.head.y = goal.y;
        autosim.tick(FRAME_MS);
        const nextGoal = findSnakeGoalProp(state);
        autosim.tick(FRAME_MS);
        const dest = autosim.getDestination();
        assert.ok(nextGoal);
        assert.ok(dest);
        const goalCell = state.obstacleGrid.worldToGrid(nextGoal.x, nextGoal.y);
        assert.equal(dest.col, goalCell.col);
        assert.equal(dest.row, goalCell.row);
    });
});

function countLiveGoalOrbs(state) {
    let count = 0;
    const goalPropId = getSnakeGameConfig().goalPropId;
    visitLiveWorldProps(state.worldProps, (prop) => {
        if (prop.type !== goalPropId) return;
        count++;
    });
    return count;
}
