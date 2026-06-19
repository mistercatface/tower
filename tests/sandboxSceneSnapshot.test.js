import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applyKineticConstraintsFromSnapshot, clearKineticConstraints, collectKineticConstraintsSnapshot } from "../Libraries/Motion/kineticConstraints.js";
import { getChainMemberIds, isChainSteeringTarget, setChainHead } from "../Libraries/Sandbox/chainLinks.js";
import { collectSandboxSceneSnapshot, SANDBOX_SCENE_SCHEMA_VERSION } from "../Libraries/Sandbox/sandboxSceneSnapshot.js";
import { collectFlatPlacedSandboxPropEntries, spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandboxPlacedSpawn.js";
import { getPropVisualTint, setPropVisualTint } from "../Libraries/Color/visualOverride.js";
import { hueToPickerHex } from "../Libraries/Color/hex.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { getSandboxEntityMeta } from "../GameState/sandboxEntityMeta.js";

loadPropAssets();

function createSnapshotTestState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        sandbox: new SandboxWorldState(),
    };
}

function applyPhysicsSnapshot(state, doc) {
    clearKineticConstraints(state.sandbox);
    getSandboxEntityMeta(state).clear();
    for (let i = state.worldProps.length - 1; i >= 0; i--) state.worldProps[i].isDead = true;
    state.worldProps.length = 0;
    const propIds = [];
    for (let i = 0; i < doc.props.length; i++) {
        const entry = doc.props[i];
        const prop = spawnPlacedSandboxProp(state, entry.x, entry.y, entry.type, entry.faction, entry.facing ?? 0, undefined, entry.visualOverride);
        propIds.push(prop.id);
    }
    applyKineticConstraintsFromSnapshot(state.sandbox, doc.kineticConstraints, propIds);
    if (doc.chainHeadProp != null) setChainHead(state, getSandboxEntityMeta(state), propIds[doc.chainHeadProp]);
}

describe("sandboxSceneSnapshot physics", () => {
    it("collectSandboxSceneSnapshot exports flat props, constraints, and chain head index", () => {
        resetKineticConstraintIds(1);
        const state = createSnapshotTestState();
        spawnLinkedBallChain(state, { col: 10, row: 10 }, {
            segmentCount: 4,
            spacing: 16,
            ballType: "ball",
            headBallType: "snake_head",
            growDirX: 1,
            growDirY: 0,
        });
        const snapshot = collectSandboxSceneSnapshot(state);
        assert.equal(snapshot.schemaVersion, SANDBOX_SCENE_SCHEMA_VERSION);
        assert.equal(snapshot.props.length, 4);
        assert.equal(snapshot.props[0].type, "snake_head");
        assert.equal(snapshot.kineticConstraints.length, 3);
        assert.equal(snapshot.chainHeadProp, 0);
    });

    it("round-trips physics fields through collect and apply helpers", () => {
        resetKineticConstraintIds(1);
        const state = createSnapshotTestState();
        const tinted = spawnPlacedSandboxProp(state, 48, 48, "ball");
        const tintHex = hueToPickerHex(135);
        setPropVisualTint(tinted, tintHex);
        spawnLinkedBallChain(state, { col: 10, row: 10 }, {
            segmentCount: 4,
            spacing: 16,
            ballType: "ball",
            growDirX: 1,
            growDirY: 0,
        });
        const { props, propIdToIndex } = collectFlatPlacedSandboxPropEntries(state);
        const meta = getSandboxEntityMeta(state);
        let chainHeadProp = null;
        state.entityRegistry.forEachOfKind("worldProp", (prop) => {
            if (prop.isDead || !meta.isChainHead(prop.id)) return;
            chainHeadProp = propIdToIndex.get(prop.id);
        });
        const physicsDoc = {
            props,
            kineticConstraints: collectKineticConstraintsSnapshot(state.sandbox, propIdToIndex),
            chainHeadProp,
        };
        const fresh = createSnapshotTestState();
        applyPhysicsSnapshot(fresh, physicsDoc);
        const freshMeta = getSandboxEntityMeta(fresh);
        assert.equal(fresh.worldProps.length, 5);
        assert.equal(fresh.sandbox.kineticConstraints.length, 3);
        const tintedProp = fresh.worldProps.find((prop) => getPropVisualTint(prop) === tintHex);
        assert.ok(tintedProp);
        const head = fresh.worldProps.find((prop) => freshMeta.isChainHead(prop.id));
        assert.ok(head);
        assert.equal(getChainMemberIds(fresh, head.id).length, 4);
        assert.ok(isChainSteeringTarget(fresh, freshMeta, head.id));
    });
});
