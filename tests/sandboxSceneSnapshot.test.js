import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getConnectedBodyIds } from "../Libraries/Physics/physics.js";
import { spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandbox.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import { createSandboxKineticWorld, createSandboxTestController } from "./harness/stateFactories.js";
import { spawnLinkedBallChain } from "./harness/spawnAgentChainHarness.js";

function createSnapshotTestState(cols = 32, rows = 32) {
    return createSandboxKineticWorld(cols, rows);
}

describe("sandboxSceneSnapshot physics", () => {
    it("exportSceneSnapshot exports flat props, constraints, and chain head index", () => {
        const state = createSnapshotTestState();
        spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid, 10, 10), {
            segmentCount: 4,
            spacing: 16,
            ballType: "ball",
            headBallType: "boid_triangle",
            growDirX: 1,
            growDirY: 0,
        });
        const controller = createSandboxTestController(state);
        const snapshot = JSON.parse(controller.exportSceneSnapshot());
        assert.equal(snapshot.props.length, 4);
        assert.equal(snapshot.props[0].type, "boid_triangle");
        assert.equal(snapshot.kineticConstraints.length, 3);
        assert.equal(snapshot.chainHeadProp, 0);
    });

    it("exportSceneSnapshot captures chain membership fields", () => {
        const state = createSnapshotTestState();
        spawnPlacedSandboxProp(state, 48, 48, "ball");
        const chain = spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid, 10, 10), {
            segmentCount: 4,
            spacing: 16,
            ballType: "ball",
            growDirX: 1,
            growDirY: 0,
        });
        const controller = createSandboxTestController(state);
        const physicsDoc = JSON.parse(controller.exportSceneSnapshot());
        assert.equal(physicsDoc.props.length, 5);
        assert.equal(physicsDoc.kineticConstraints.length, 3);
        assert.ok(physicsDoc.chainHeadProp != null);
        assert.equal(physicsDoc.props[physicsDoc.chainHeadProp].type, chain.head.type);
        assert.ok(state.sandbox.entityMeta.isChainHead(chain.head.id));
        assert.equal(getConnectedBodyIds(state.kinetic, chain.head.id).length, 4);
    });
});
