import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FractureEngine } from "../Libraries/Physics/fracture.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { applyPropBoxFootprint } from "../Libraries/Props/props.js";
import { removeWorldPropFromState, EntityRegistry } from "../GameState/EntityRegistry.js";
import { kineticDynamicSlab } from "../Libraries/Physics/physics.js";
import { spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandbox.js";
import { SandboxWorldState } from "../Libraries/Sandbox/sandbox.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";

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

describe("fracture shard pool ownership", () => {
    it("editor spawn and delete does not feed fracture shard pool", () => {
        const state = createEditorState();
        const beforeMaxId = nextWorldPropIdSnapshot();
        const prop = spawnPlacedSandboxProp(state, 0, 0, "glass_pane", null, 0);
        const editorId = prop.id;
        removeWorldPropFromState(state, prop, state.spatialFrame);
        const prop2 = new WorldProp(0, 0, "glass_pane", 0);
        applyPropBoxFootprint(prop2, 32, 32);
        const fracture = FractureEngine.fracturePropOnImpact(prop2, 0, 0, 30);
        assert.ok(fracture);
        const spawned = FractureEngine.spawnFractureShards(state, prop2, fracture, null);
        assert.ok(spawned.length >= 2);
        for (const shard of spawned) {
            assert.ok(shard._fractureSpawned);
            assert.ok(shard.id > editorId, "shard ids should not reuse editor-deleted prop");
        }
        assert.ok(spawned[0].id >= beforeMaxId);
    });

    it("fracture debris release reuses instances via acquireShard", () => {
        const state = createFractureState();
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        prop._physId = 0;
        kineticDynamicSlab.x[0] = 0;
        kineticDynamicSlab.y[0] = 0;
        applyPropBoxFootprint(prop, 32, 32);
        const fracture = FractureEngine.fracturePropOnImpact(prop, 0, 0, 30);
        assert.ok(fracture);
        const spawned = FractureEngine.spawnFractureShards(state, prop, fracture, null);
        const originalIds = spawned.map((s) => s.id);
        for (let i = spawned.length - 1; i >= 0; i--) {
            removeWorldPropFromState(state, spawned[i], { evictKineticProp() {} });
        }
        const fractureAgain = FractureEngine.fracturePropOnImpact(prop, 0, 0, 30);
        const spawnedAgain = FractureEngine.spawnFractureShards(state, prop, fractureAgain, null);
        for (const id of spawnedAgain.map((s) => s.id)) {
            assert.ok(originalIds.includes(id));
        }
    });
});

function nextWorldPropIdSnapshot() {
    const probe = new WorldProp(0, 0, "ball", 0);
    return probe.id;
}
