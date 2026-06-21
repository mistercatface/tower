import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { HpaPathSession } from "../Libraries/Pathfinding/HpaPathSession.js";
import { SandboxEntityMetaStore } from "../GameState/sandboxEntityMeta.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { createFlowGroundNavBehavior } from "../Libraries/Sandbox/groundNav/flowGroundNavBehavior.js";
import { FRAME_MS } from "./frameMs.js";
import { steerRollToward, getKineticRollConfig } from "../Libraries/Sandbox/kineticRollActuator.js";

function createNavState(prop) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 32 * 16, 32 * 16);
    const mockWorker = {
        getPathSlot: () => -1,
        releaseOwnedPathSlot: () => {},
        releaseSlot: () => {},
        requestPath: async () => ({ result: { pathLen: 0, pathSlot: -1, pathProgressIdx: 0 } }),
    };
    const session = new HpaPathSession(mockWorker);
    return {
        obstacleGrid: grid,
        sandbox: { entityMeta: new SandboxEntityMetaStore() },
        nav: { settings: { recenterThreshold: 64 }, topologyKey: () => "", syncedTopologyKey: () => "", graphSyncGeneration: 0, commitEdit: async () => {}, worker: mockWorker, session, topology: null },
        flowFieldGrid: { ensureRollTargetWindow() {}, refresh() {}, getReadyFlowField: () => null },
        entityRegistry: {
            getLive(id) {
                return id === prop.id ? prop : null;
            },
        },
        viewport: { circleInBounds: () => true },
    };
}

function rollingProp(id = 1) {
    return { id, x: 40, y: 56, radius: 2, vx: 12, vy: -8, strategy: { rolls: true, groundNav: {} } };
}

describe("ground nav arrival", () => {
    it("hpa clears roll drive at destination without zeroing velocity", () => {
        const prop = rollingProp();
        const state = createNavState(prop);
        const hpa = createHpaGroundNavBehavior(state);
        const target = state.obstacleGrid.gridToWorld(4, 6);
        hpa.setMoveTarget(prop, target);
        steerRollToward(prop, 1, 0, getKineticRollConfig(prop));
        prop.x = target.x;
        prop.y = target.y;

        hpa.tickWorld(FRAME_MS);

        assert.equal(hpa.hasMoveTarget(prop), false);
        assert.equal(prop._groundRollDrive, undefined);
        assert.equal(prop.vx, 12);
        assert.equal(prop.vy, -8);
    });

    it("flow clears roll drive at destination without zeroing velocity", () => {
        const prop = rollingProp(2);
        const state = createNavState(prop);
        const flow = createFlowGroundNavBehavior(state);
        const target = state.obstacleGrid.gridToWorld(5, 7);
        flow.setMoveTarget(prop, target);
        steerRollToward(prop, 0, 1, getKineticRollConfig(prop));
        prop.x = target.x;
        prop.y = target.y;

        flow.tickWorld(FRAME_MS);

        assert.equal(prop._groundRollDrive, undefined);
        assert.equal(prop.vx, 12);
        assert.equal(prop.vy, -8);
    });
});
