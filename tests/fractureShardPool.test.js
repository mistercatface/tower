import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FractureEngine } from "../Libraries/Physics/fracture.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { applyPropBoxFootprint } from "../Libraries/Props/props.js";
import { kineticDynamicSlab } from "../Libraries/Physics/physics.js";
import { spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandbox.js";
import { SandboxWorldState } from "../Libraries/Sandbox/sandbox.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";

function createEditorState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: { kineticConstraints: [] },
        sandbox: new SandboxWorldState(),
        spatialFrame: { evictKineticProp() {}, admitKineticProp() {}, admitKineticProps() {} },
    };
}

function createFractureState() {
    const state = createEditorState();
    state.fractureEngine = new FractureEngine(state);
    return state;
}

describe("fracture debris slab ownership", () => {
    it("editor spawn and delete does not feed debris slab pool", () => {
        const state = createFractureState();
        const prop = spawnPlacedSandboxProp(state, 0, 0, "glass_pane", null, 0);
        const editorId = prop.id;
        removeEditorProp(state, prop);
        const prop2 = new WorldProp(0, 0, "glass_pane", 0);
        applyPropBoxFootprint(prop2, 32, 32);
        const fracture = FractureEngine.fracturePropOnImpact(prop2, 0, 0, 30);
        assert.ok(fracture);
        const spawned = FractureEngine.spawnFractureShards(state, prop2, fracture, null);
        assert.ok(spawned.length >= 2);
        for (const shard of spawned) {
            assert.equal(shard.isWallDebris, true);
            assert.ok(shard.id !== editorId);
        }
        assert.equal(state.worldProps.length, 0);
    });

    it("debris slab bodies are pooled and reused after removal", () => {
        const state = createFractureState();
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        prop._physId = 0;
        kineticDynamicSlab.x[0] = 0;
        kineticDynamicSlab.y[0] = 0;
        applyPropBoxFootprint(prop, 32, 32);
        const fracture = FractureEngine.fracturePropOnImpact(prop, 0, 0, 30);
        assert.ok(fracture);
        const spawned = FractureEngine.spawnFractureShards(state, prop, fracture, null);
        const originalBodies = spawned.slice();
        const spatialFrame = { evictKineticProp() {} };
        for (let i = spawned.length - 1; i >= 0; i--) {
            state.fractureEngine.wallDebris.remove(spawned[i], spatialFrame);
        }
        const fractureAgain = FractureEngine.fracturePropOnImpact(prop, 0, 0, 30);
        const spawnedAgain = FractureEngine.spawnFractureShards(state, prop, fractureAgain, null);
        for (const body of spawnedAgain) {
            assert.ok(originalBodies.includes(body));
        }
    });
});

function removeEditorProp(state, prop) {
    const index = state.worldProps.indexOf(prop);
    if (index >= 0) state.worldProps.splice(index, 1);
    state.entityRegistry.unregister(prop);
    state.spatialFrame.evictKineticProp(prop, state.kinetic);
    prop.isDead = true;
}
