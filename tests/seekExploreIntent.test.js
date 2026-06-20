import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBrain } from "../Libraries/AI/brain/createBrain.js";
import { createSeekExploreIntent } from "../Libraries/AI/agentIntent/createSeekExploreIntent.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { HPA_GROUND_NAV_BEHAVIOR_ID, DIRECT_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";

function mockMoveBehavior() {
    const targets = new Map();
    return {
        setMoveTarget(prop, world) {
            targets.set(prop.id, { x: world.x, y: world.y });
        },
        clearMoveTarget(prop) {
            targets.delete(prop.id);
        },
        hasMoveTarget(prop) {
            return targets.has(prop.id);
        },
        getTarget(prop) {
            return targets.get(prop.id) ?? null;
        },
    };
}

function createIntentTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 512, 512);
    return { obstacleGrid: grid };
}

describe("createSeekExploreIntent", () => {
    it("enters seek when resolveVisibleGoal returns a target", () => {
        const state = createIntentTestState();
        const agent = { id: 1, x: 80, y: 80, facing: 0 };
        const goal = { id: 99, x: 160, y: 80 };
        const hpa = mockMoveBehavior();
        const direct = mockMoveBehavior();
        const behaviorById = new Map([
            [HPA_GROUND_NAV_BEHAVIOR_ID, hpa],
            [DIRECT_GROUND_NAV_BEHAVIOR_ID, direct],
        ]);
        const brain = createBrain({ spatialMemoryCapacity: 16 });
        const intent = createSeekExploreIntent({
            brain,
            sync() {},
            behaviorById,
            setActiveBehaviorId() {},
            resolveVisibleGoal: () => goal,
            resolveExploreCell: () => ({ col: 20, row: 5 }),
        });
        intent.refresh(agent, state);
        assert.equal(intent.getMode(), "seek");
        assert.equal(intent.getTrackedGoalId(), 99);
        assert.ok(hpa.hasMoveTarget(agent));
        assert.equal(hpa.getTarget(agent).x, 160);
    });

    it("enters explore when no visible goal and picks explore cell", () => {
        const state = createIntentTestState();
        const agent = { id: 1, x: 80, y: 80, facing: 0 };
        const hpa = mockMoveBehavior();
        const direct = mockMoveBehavior();
        const behaviorById = new Map([
            [HPA_GROUND_NAV_BEHAVIOR_ID, hpa],
            [DIRECT_GROUND_NAV_BEHAVIOR_ID, direct],
        ]);
        const brain = createBrain({ spatialMemoryCapacity: 16 });
        const intent = createSeekExploreIntent({
            brain,
            sync() {},
            behaviorById,
            setActiveBehaviorId() {},
            resolveVisibleGoal: () => null,
            resolveExploreCell: () => ({ col: 12, row: 8 }),
        });
        intent.refresh(agent, state);
        assert.equal(intent.getMode(), "explore");
        assert.equal(intent.getTrackedGoalId(), null);
        assert.ok(hpa.hasMoveTarget(agent));
        const target = hpa.getTarget(agent);
        const cell = state.obstacleGrid.worldToGrid(target.x, target.y);
        assert.equal(cell.col, 12);
        assert.equal(cell.row, 8);
    });

    it("switches from seek to explore when visible goal disappears", () => {
        const state = createIntentTestState();
        const agent = { id: 1, x: 80, y: 80, facing: 0 };
        const goal = { id: 99, x: 160, y: 80 };
        let visible = goal;
        const hpa = mockMoveBehavior();
        const direct = mockMoveBehavior();
        const behaviorById = new Map([
            [HPA_GROUND_NAV_BEHAVIOR_ID, hpa],
            [DIRECT_GROUND_NAV_BEHAVIOR_ID, direct],
        ]);
        const brain = createBrain({ spatialMemoryCapacity: 16 });
        const intent = createSeekExploreIntent({
            brain,
            sync() {},
            behaviorById,
            setActiveBehaviorId() {},
            resolveVisibleGoal: () => visible,
            resolveExploreCell: () => ({ col: 6, row: 6 }),
        });
        intent.refresh(agent, state);
        assert.equal(intent.getMode(), "seek");
        visible = null;
        intent.refresh(agent, state);
        assert.equal(intent.getMode(), "explore");
    });
});
