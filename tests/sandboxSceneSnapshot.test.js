import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyKineticConstraintsFromSnapshot, clearKineticConstraints, getConnectedBodyIds } from "../Libraries/Physics/physics.js";
import { isChainSteeringTarget, setChainHead, collectSandboxSceneSnapshot, spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandbox.js";
import { getPropVisualTint, setPropVisualTint } from "../Libraries/Color/visualOverride.js";
import { hslToHex, normalizeHue } from "../Libraries/Color/colorMath.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import { kineticConstraintStore } from "../Core/engineMemory.js";
import { createSandboxKineticWorld } from "./harness/stateFactories.js";
import { spawnLinkedBallChain } from "./harness/spawnAgentChainHarness.js";

function createSnapshotTestState(cols = 32, rows = 32) {
    return createSandboxKineticWorld(cols, rows);
}

function applyPhysicsSnapshot(state, doc) {
    clearKineticConstraints(state.kinetic);
    state.sandbox.entityMeta.clear();
    for (let i = state.worldProps.length - 1; i >= 0; i--) state.worldProps[i].isDead = true;
    state.worldProps.length = 0;
    const propRefs = new Array(doc.props.length);
    for (let i = 0; i < doc.props.length; i++) {
        const entry = doc.props[i];
        const prop = spawnPlacedSandboxProp(state, entry.x, entry.y, entry.type, entry.faction, entry.facing ?? 0, undefined, entry.visualOverride);
        propRefs[i] = prop;
    }
    applyKineticConstraintsFromSnapshot(state.kinetic, doc.kineticConstraints, propRefs);
    if (doc.chainHeadProp != null) setChainHead(state, state.sandbox.entityMeta, propRefs[doc.chainHeadProp].id);
}

describe("sandboxSceneSnapshot physics", () => {
    it("collectSandboxSceneSnapshot exports flat props, constraints, and chain head index", () => {
        const state = createSnapshotTestState();
        spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid, 10, 10), {
            segmentCount: 4,
            spacing: 16,
            ballType: "ball",
            headBallType: "boid_triangle",
            growDirX: 1,
            growDirY: 0,
            faction: "alpha",
        });
        const snapshot = collectSandboxSceneSnapshot(state);
        assert.equal(snapshot.props.length, 4);
        assert.equal(snapshot.props[0].type, "boid_triangle");
        assert.equal(snapshot.kineticConstraints.length, 3);
        assert.equal(snapshot.chainHeadProp, 0);
    });

    it("round-trips physics fields through collect and apply helpers", () => {
        const state = createSnapshotTestState();
        const tinted = spawnPlacedSandboxProp(state, 48, 48, "ball", "alpha");
        const tintHex = hslToHex(normalizeHue(135), 70, 50);
        setPropVisualTint(tinted, tintHex);
        spawnLinkedBallChain(state, worldIdxAtCell(state.obstacleGrid, 10, 10), {
            segmentCount: 4,
            spacing: 16,
            ballType: "ball",
            growDirX: 1,
            growDirY: 0,
            faction: "alpha",
        });
        const physicsDoc = collectSandboxSceneSnapshot(state);
        const fresh = createSnapshotTestState();
        applyPhysicsSnapshot(fresh, physicsDoc);
        const freshMeta = fresh.sandbox.entityMeta;
        assert.equal(fresh.worldProps.length, 5);
        assert.equal(kineticConstraintStore.count, 3);
        const tintedProp = fresh.worldProps.find((prop) => getPropVisualTint(prop) === tintHex);
        assert.ok(tintedProp);
        const head = fresh.worldProps.find((prop) => freshMeta.isChainHead(prop.id));
        assert.ok(head);
        assert.equal(getConnectedBodyIds(fresh.kinetic, head.id).length, 4);
        assert.ok(isChainSteeringTarget(fresh, freshMeta, head.id));
    });
});
