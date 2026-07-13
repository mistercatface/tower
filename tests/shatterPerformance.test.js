import { FractureEngine } from "../Libraries/Physics/fracture.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addWorldPropsToState, removeWorldPropEid } from "../GameState/EntityRegistry.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { KineticSpatialFrame } from "../Libraries/Spatial/spatial.js";
import { kineticDynamicSlab, entityRefs } from "../Core/engineMemory.js";
import { createFractureWorld, setupPropForFracture, spawnFractureShards, liveWorldPropCount, assertDebrisKind } from "./harness/fractureHarness.js";
import { ENTITY_KIND_WORLD_PROP } from "../Core/engineEnums.js";
import { releaseEntityEid } from "../Core/entitySlots.js";

describe("Shatter / Debris Performance Fixes", () => {
    it("EntityRegistry membershipGen increments once for batch operations", () => {
        const world = createFractureWorld();
        const initialGen = world.entityRegistry.membershipGen;

        const props = [];
        for (let i = 0; i < 18; i++) {
            props.push(new WorldProp(i * 10, 0, "box", 0));
        }

        addWorldPropsToState(world, props);

        assert.equal(world.entityRegistry.membershipGen, initialGen + 1);
        assert.equal(liveWorldPropCount(world.entityRegistry), 18);
    });

    it("debris slab bodies are pooled and reused after shatter", () => {
        const world = createFractureWorld();
        const prop = new WorldProp(0, 0, "box", 0);
        setupPropForFracture(prop, 32, 32);

        const result = spawnFractureShards(world, prop, 30);
        assert.ok(result);
        assert.ok(result.shards.length >= 2);
        const originalBodies = result.shards.slice();
        assert.ok(result.shards.every((s) => assertDebrisKind(s)));
        assert.equal(liveWorldPropCount(world.entityRegistry), 0);

        const spatialFrame = { evictKineticEid(eid) {
            const prop = entityRefs[eid];
            if (prop) delete prop._physId;
            releaseEntityEid(eid);
        } };
        for (let i = result.shards.length - 1; i >= 0; i--) {
            world.fractureEngine.releaseDebrisEid(result.shards[i]._physId, spatialFrame);
        }

        assert.ok(FractureEngine.fracturePropOnImpact(prop, 0, 0, 30, world.fractureEngine));
        const spawnedAgain = world.fractureEngine.spawnShardsFromFracture(prop);
        assert.ok(spawnedAgain.length >= 2);

        for (const body of spawnedAgain) {
            assert.ok(originalBodies.includes(body));
        }
    });

    it("KineticSpatialFrame assigns unique monotonic physIds and prevents collision", () => {
        const world = createFractureWorld();
        const frame = new KineticSpatialFrame();

        const propA = new WorldProp(0, 0, "box", 0);
        const propB = new WorldProp(100, 0, "box", 0);
        const propC = new WorldProp(200, 0, "box", 0);

        addWorldPropsToState(world, [propA, propB, propC]);
        frame.begin(world);

        assert.equal(typeof propA._physId, "number");
        assert.equal(propB._physId, propA._physId + 1);
        assert.equal(propC._physId, propA._physId + 2);

        const propNew = new WorldProp(300, 0, "box", 0);
        frame.admitKineticEids([propNew._physId], 1, world);

        assert.equal(propNew._physId, propC._physId + 1);
    });

    it("begin() keeps physIds stable when membership is unchanged", () => {
        const world = createFractureWorld();
        const frame = new KineticSpatialFrame();
        const prop = new WorldProp(0, 0, "box", 0);
        world.entityRegistry.register(ENTITY_KIND_WORLD_PROP, prop);
        frame.begin(world);
        const idA = prop._physId;
        const propB = new WorldProp(100, 0, "box", 0);
        frame.admitKineticEids([propB._physId], 1, world);
        assert.equal(propB._physId, idA + 1);
        world.entityRegistry.register(ENTITY_KIND_WORLD_PROP, propB);
        frame.begin(world);
        assert.equal(prop._physId, idA);
        assert.equal(propB._physId, idA + 1);
    });

    it("evict returns physId to free list and scrubs slab on reuse", () => {
        const world = createFractureWorld();
        const frame = new KineticSpatialFrame();
        const prop = new WorldProp(0, 0, "box", 0);
        world.entityRegistry.register(ENTITY_KIND_WORLD_PROP, prop);
        frame.begin(world);
        const releasedId = prop._physId;
        prop.vx = 999;
        removeWorldPropEid(world, prop._physId, frame);
        assert.equal(prop._physId, undefined);
        const replacement = new WorldProp(50, 0, "box", 0);
        world.entityRegistry.register(ENTITY_KIND_WORLD_PROP, replacement);
        frame.begin(world);
        assert.equal(replacement._physId, releasedId);
        assert.equal(kineticDynamicSlab.vx[releasedId], 0);
    });
});
