import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry, findLiveWorldProp } from "../GameState/EntityRegistry.js";
import { KineticSession, createKineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { resetKineticConstraintIds } from "../Libraries/Physics/physics.js";
import { applyKineticConstraintsFromSnapshot, clearKineticConstraints, collectKineticConstraintsSnapshot } from "../Libraries/Physics/physics.js";
import { getConnectedBodyIds } from "../Libraries/Physics/physics.js";
import { isChainSteeringTarget, setChainHead, collectSandboxSceneSnapshot, SANDBOX_SCENE_SCHEMA_VERSION, collectFlatPlacedSandboxPropEntries, spawnPlacedSandboxProp, spawnLinkedBallChain } from "../Libraries/Sandbox/sandbox.js";
import { getPropVisualTint, setPropVisualTint } from "../Libraries/Color/visualOverride.js";
import { hueToPickerHex } from "../Libraries/Color/colorMath.js";
import { colRowToIndex } from "./harness/testGridUtils.js";

function createSnapshotTestState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
    };
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
        resetKineticConstraintIds(1);
        const state = createSnapshotTestState();
        spawnLinkedBallChain(state, colRowToIndex(10, 10, state.obstacleGrid.cols), {
            segmentCount: 4,
            spacing: 16,
            ballType: "ball",
            headBallType: "boid_triangle",
            growDirX: 1,
            growDirY: 0,
        });
        const snapshot = collectSandboxSceneSnapshot(state);
        assert.equal(snapshot.schemaVersion, SANDBOX_SCENE_SCHEMA_VERSION);
        assert.equal(snapshot.props.length, 4);
        assert.equal(snapshot.props[0].type, "boid_triangle");
        assert.equal(snapshot.kineticConstraints.length, 3);
        assert.equal(snapshot.chainHeadProp, 0);
    });

    it("round-trips physics fields through collect and apply helpers", () => {
        resetKineticConstraintIds(1);
        const state = createSnapshotTestState();
        const tinted = spawnPlacedSandboxProp(state, 48, 48, "ball");
        const tintHex = hueToPickerHex(135);
        setPropVisualTint(tinted, tintHex);
        spawnLinkedBallChain(state, colRowToIndex(10, 10, state.obstacleGrid.cols), {
            segmentCount: 4,
            spacing: 16,
            ballType: "ball",
            growDirX: 1,
            growDirY: 0,
        });
        const { props, propIdToIndex } = collectFlatPlacedSandboxPropEntries(state);
        const meta = state.sandbox.entityMeta;
        const headProp = findLiveWorldProp(state.worldProps, (prop) => meta.isChainHead(prop.id));
        const chainHeadProp = headProp ? propIdToIndex.get(headProp.id) : null;
        const physicsDoc = {
            props,
            kineticConstraints: collectKineticConstraintsSnapshot(state.kinetic, propIdToIndex),
            chainHeadProp,
        };
        const fresh = createSnapshotTestState();
        applyPhysicsSnapshot(fresh, physicsDoc);
        const freshMeta = fresh.sandbox.entityMeta;
        assert.equal(fresh.worldProps.length, 5);
        assert.equal(fresh.kinetic.kineticConstraints.length, 3);
        const tintedProp = fresh.worldProps.find((prop) => getPropVisualTint(prop) === tintHex);
        assert.ok(tintedProp);
        const head = fresh.worldProps.find((prop) => freshMeta.isChainHead(prop.id));
        assert.ok(head);
        assert.equal(getConnectedBodyIds(fresh.kinetic, head.id).length, 4);
        assert.ok(isChainSteeringTarget(fresh, freshMeta, head.id));
    });
});
