import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getConnectedBodyIds } from "../Libraries/Physics/physics.js";
import { isChainSteeringTarget } from "../Libraries/Sandbox/sandbox.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import { kineticConstraintStore } from "../Core/engineMemory.js";
import { createSandboxKineticWorld } from "./harness/stateFactories.js";
import { spawnLinkedBallChain, growChainSegment } from "./harness/spawnAgentChainHarness.js";

const CHAIN_OPTIONS = { segmentCount: 3, spacing: 16, ballType: "ball", growDirX: -1, growDirY: 0, exportType: "test_chain", linkSlack: 1, faction: "alpha" };

describe("spawnLinkedBallChain", () => {
    it("spawns a linked ball chain with one head and distance links", () => {
        const state = createSandboxKineticWorld();
        const meta = state.sandbox.entityMeta;
        const anchorIdx = worldIdxAtCell(state.obstacleGrid,10, 10);
        const chain = spawnLinkedBallChain(state, anchorIdx, CHAIN_OPTIONS);
        assert.equal(chain.members.length, 3);
        assert.equal(kineticConstraintStore.count, 2);
        assert.ok(meta.isChainHead(chain.head.id));
        assert.ok(!meta.isChainHead(chain.tail.id));
        assert.ok(isChainSteeringTarget(state, meta, chain.head.id));
        assert.ok(!isChainSteeringTarget(state, meta, chain.tail.id));
        const members = getConnectedBodyIds(state.kinetic, chain.head.id).sort((a, b) => a - b);
        assert.deepEqual(
            members,
            chain.members.map((prop) => prop.id).sort((a, b) => a - b),
        );
        for (let i = 0; i < kineticConstraintStore.count; i++) assert.ok(Math.abs(kineticConstraintStore.restLength[i] - 16) < 1e-6);
    });
    it("growChainSegment links a new tail segment at spacing", () => {
        const state = createSandboxKineticWorld();
        const chain = spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid,10, 10), CHAIN_OPTIONS);
        const tail = chain.tail;
        const segment = growChainSegment(state, tail, CHAIN_OPTIONS);
        assert.equal(kineticConstraintStore.count, 3);
        assert.equal(segment.x, tail.x - CHAIN_OPTIONS.spacing);
        assert.equal(segment.y, tail.y);
    });
    it("spawnLinkedBallChain uses headBallType for the first segment only", () => {
        const state = createSandboxKineticWorld();
        const chain = spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid,10, 10), { ...CHAIN_OPTIONS, headBallType: "cross_pinwheel" });
        assert.equal(chain.head.type, "cross_pinwheel");
        assert.equal(chain.tail.type, CHAIN_OPTIONS.ballType);
    });
    it("spawnLinkedBallChain applies segmentRadius to every member", () => {
        const state = createSandboxKineticWorld();
        const chain = spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid,10, 10), { ...CHAIN_OPTIONS, segmentRadius: 2.1, spacing: 4.0, linkSlack: 1.05 });
        assert.equal(chain.head.radius, 2.1);
        assert.equal(chain.tail.radius, 2.1);
        assert.ok(Math.abs(kineticConstraintStore.restLength[0] - 4.2) < 1e-5);
    });
    it("assigns a unique spawn group id per chain", () => {
        const state = createSandboxKineticWorld();
        const first = spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid,4, 4), CHAIN_OPTIONS);
        const second = spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid,12, 12), CHAIN_OPTIONS);
        assert.notEqual(first.spawnGroupId, second.spawnGroupId);
    });
});
