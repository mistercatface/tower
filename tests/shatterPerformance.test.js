import { FractureEngine } from "../Libraries/Physics/fracture.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addWorldPropsToState } from "../GameState/EntityRegistry.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { KineticSpatialFrame } from "../Libraries/Spatial/spatial.js";
import { createFractureWorld, setupGlassPaneForFracture, spawnGlassFractureShards } from "./harness/fractureHarness.js";

describe("Shatter / Debris Performance Fixes", () => {
    it("EntityRegistry membershipGen increments once for batch operations", () => {
        const world = createFractureWorld();
        const initialGen = world.entityRegistry.membershipGen;

        const props = [];
        for (let i = 0; i < 18; i++) {
            props.push(new WorldProp(i * 10, 0, "glass_pane", 0));
        }

        addWorldPropsToState(world, props);

        assert.equal(world.entityRegistry.membershipGen, initialGen + 1);
        assert.equal(world.worldProps.length, 18);
    });

    it("debris slab bodies are pooled and reused after glass shatter", () => {
        const world = createFractureWorld();
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        setupGlassPaneForFracture(prop, 32, 32);

        const result = spawnGlassFractureShards(world, prop, 30);
        assert.ok(result);
        assert.ok(result.shards.length >= 2);
        const originalBodies = result.shards.slice();
        assert.ok(result.shards.every((s) => s.isKineticDebris));
        assert.equal(world.worldProps.length, 0);

        const spatialFrame = { evictKineticProp() {} };
        for (let i = result.shards.length - 1; i >= 0; i--) {
            world.fractureEngine.debris.remove(result.shards[i], spatialFrame);
        }

        const fractureAgain = FractureEngine.fracturePropOnImpact(prop, 0, 0, 30);
        const stores = fractureAgain._stores ?? world.fractureEngine.stores;
        const spawnedAgain = world.fractureEngine.debris.spawnShardsFromFracture(prop, fractureAgain, stores);
        assert.ok(spawnedAgain.length >= 2);

        for (const body of spawnedAgain) {
            assert.ok(originalBodies.includes(body));
        }
    });

    it("KineticSpatialFrame assigns unique monotonic physIds and prevents collision", () => {
        const world = createFractureWorld();
        const frame = new KineticSpatialFrame();

        const propA = new WorldProp(0, 0, "crate", 0);
        const propB = new WorldProp(100, 0, "crate", 0);
        const propC = new WorldProp(200, 0, "crate", 0);

        world.worldProps.push(propA, propB, propC);
        frame.begin(world);

        assert.equal(frame._nextPhysId, 3);

        const propNew = new WorldProp(300, 0, "crate", 0);
        frame.admitKineticProps([propNew], world);

        assert.equal(propNew._physId, 3);
        assert.equal(frame._nextPhysId, 4);
    });

    it("begin() reassigns physIds from zero each frame (Phase 2 will change this)", () => {
        const world = createFractureWorld();
        const frame = new KineticSpatialFrame();
        const prop = new WorldProp(0, 0, "crate", 0);
        world.worldProps.push(prop);
        frame.begin(world);
        assert.equal(prop._physId, 0);
        const propB = new WorldProp(100, 0, "crate", 0);
        frame.admitKineticProps([propB], world);
        assert.equal(propB._physId, 1);
        world.worldProps.push(propB);
        frame.begin(world);
        assert.equal(prop._physId, 0);
        assert.equal(propB._physId, 1);
    });
});
