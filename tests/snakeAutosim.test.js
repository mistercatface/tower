import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";
import { createSnakeAutosim } from "../Libraries/Sandbox/autosim/snakeAutosim.js";
import { GOAL_ORB_PROP_TYPE, spawnGoalOrbAtCell, spawnSnakeChain } from "../Libraries/Sandbox/spawnSnakeChain.js";

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
        hpaPathWorker: { getPathSlot: () => null },
    };
}

function countLiveGoalOrbs(state) {
    let count = 0;
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead || prop.type !== GOAL_ORB_PROP_TYPE) return;
        count++;
    });
    return count;
}

describe("snakeAutosim", () => {
    it("eating the goal adds a chain segment and respawns the goal orb", () => {
        resetKineticConstraintIds(1);
        const state = createSnakeAutosimTestState();
        const chain = spawnSnakeChain(state, { col: 10, row: 10 });
        const goal = spawnGoalOrbAtCell(state, { col: 14, row: 10 });
        const behaviorById = new Map([[HPA_GROUND_NAV_BEHAVIOR_ID, createHpaGroundNavBehavior(state)]]);
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
        assert.notEqual(findLiveGoalOrb(state)?.id, goal.id);
    });

    it("re-issues HPA nav toward a respawned goal", () => {
        resetKineticConstraintIds(1);
        const state = createSnakeAutosimTestState();
        const chain = spawnSnakeChain(state, { col: 8, row: 8 });
        const goal = spawnGoalOrbAtCell(state, { col: 12, row: 8 });
        const hpaBehavior = createHpaGroundNavBehavior(state);
        const behaviorById = new Map([[HPA_GROUND_NAV_BEHAVIOR_ID, hpaBehavior]]);
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
        const nextGoal = findLiveGoalOrb(state);
        autosim.tick(1 / 60);
        hpaBehavior.setMoveTarget(chain.head, { x: nextGoal.x, y: nextGoal.y });
        assert.ok(hpaBehavior.getPathOverlay(chain.head));
    });
});

function findLiveGoalOrb(state) {
    let goal = null;
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead || prop.type !== GOAL_ORB_PROP_TYPE) return;
        goal = prop;
    });
    return goal;
}
