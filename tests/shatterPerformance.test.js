import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { EntityRegistry, addWorldPropsToState, removeWorldPropFromState } from "../GameState/EntityRegistry.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { kineticDynamicSlab } from "../Libraries/Spatial/collision/kineticBodySlab.js";
import { KineticSpatialFrame } from "../Systems/World/KineticSpatialFrame.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { clearWorldPropPools, getWorldPropPoolSize } from "../Libraries/Props/worldPropPool.js";
import { spawnGlassShatterShards, queueFractureKineticContact, flushDeferredFractures } from "../Libraries/Props/propFracture.js";
import { applyPropBoxFootprint } from "../Libraries/Props/propStrategy.js";
import { fracturePropOnImpact } from "../Libraries/Props/propFracture.js";

function createTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
    };
}

describe("Shatter / Debris Performance Fixes", () => {
    beforeEach(() => {
        clearWorldPropPools();
    });

    it("EntityRegistry membershipGen increments once for batch operations", () => {
        const state = createTestState();
        const initialGen = state.entityRegistry.membershipGen;
        
        const props = [];
        for (let i = 0; i < 18; i++) {
            props.push(new WorldProp(i * 10, 0, "glass_pane", 0));
        }

        addWorldPropsToState(state, props);

        assert.equal(state.entityRegistry.membershipGen, initialGen + 1);
        assert.equal(state.worldProps.length, 18);
    });

    it("WorldProp instances are correctly pooled and reused", () => {
        const state = createTestState();
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        prop._physId = 0;
        kineticDynamicSlab.x[0] = 0;
        kineticDynamicSlab.y[0] = 0;
        applyPropBoxFootprint(prop, 32, 32);
        
        const fracture = fracturePropOnImpact(prop, 0, 0, 30);
        assert.ok(fracture);

        // Spawn shards
        const spawned = spawnGlassShatterShards(state, prop, fracture, null);
        assert.ok(spawned.length >= 2);
        const originalShardIds = spawned.map(s => s.id);

        // Clean up spawned shards (which releases them to the pool)
        for (let i = spawned.length - 1; i >= 0; i--) {
            removeWorldPropFromState(state, spawned[i], { evictKineticProp() {} });
        }

        assert.equal(getWorldPropPoolSize("glass_pane"), spawned.length);

        // Shatter again and verify same instances are acquired
        const spawnedAgain = spawnGlassShatterShards(state, prop, fracture, null);
        assert.ok(spawnedAgain.length >= 2);
        
        // Identity check: pooled props should have the same IDs (since references are reused)
        const reacquiredIds = spawnedAgain.map(s => s.id);
        
        // Assert we reused the exact same instances from the pool
        for (const id of reacquiredIds) {
            assert.ok(originalShardIds.includes(id));
        }
        
        assert.equal(getWorldPropPoolSize("glass_pane"), 0);
    });

    it("KineticSpatialFrame assigns unique monotonic physIds and prevents collision", () => {
        const state = createTestState();
        const frame = new KineticSpatialFrame();
        
        // Populate frame with 3 props
        const propA = new WorldProp(0, 0, "crate", 0);
        const propB = new WorldProp(100, 0, "crate", 0);
        const propC = new WorldProp(200, 0, "crate", 0);
        
        state.worldProps.push(propA, propB, propC);
        frame.begin(state);

        // Check initial nextPhysId
        assert.equal(frame._nextPhysId, 3);
        
        // Mid-tick admit
        const propNew = new WorldProp(300, 0, "crate", 0);
        frame.admitKineticProp(propNew, state);
        
        // Assert unique physId was assigned
        assert.equal(propNew._physId, 3);
        assert.equal(frame._nextPhysId, 4);
    });
});
