import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FractureEngine } from "../Libraries/Physics/fracture.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandbox.js";
import { createFractureWorld, removeEditorPropFromWorld, setupPropForFracture, spawnFractureShards, liveWorldPropCount, assertDebrisKind } from "./harness/fractureHarness.js";
import { entityRefs } from "../Core/engineMemory.js";
import { releaseEntityEid } from "../Core/entitySlots.js";

describe("fracture debris slab ownership", () => {
    it("editor spawn and delete does not feed debris slab pool", () => {
        const world = createFractureWorld();
        const prop = spawnPlacedSandboxProp(world, 0, 0, "box", 0);
        const editorId = prop.id;
        removeEditorPropFromWorld(world, prop);
        const pane = new WorldProp(0, 0, "box", 0);
        setupPropForFracture(pane, 32, 32);
        const result = spawnFractureShards(world, pane, 30);
        assert.ok(result);
        assert.ok(result.shards.length >= 2);
        for (const shard of result.shards) {
            assert.ok(assertDebrisKind(shard));
            assert.ok(shard.id !== editorId);
        }
        assert.equal(liveWorldPropCount(world.entityRegistry), 0);
    });

    it("debris slab bodies are pooled and reused after removal", () => {
        const world = createFractureWorld();
        const prop = new WorldProp(0, 0, "box", 0);
        setupPropForFracture(prop, 32, 32);
        const result = spawnFractureShards(world, prop, 30);
        assert.ok(result);
        const originalBodies = result.shards.slice();
        const spatialFrame = { evictKineticEid(eid) {
            const prop = entityRefs[eid];
            if (prop) delete prop._physId;
            releaseEntityEid(eid);
        } };
        for (let i = result.shards.length - 1; i >= 0; i--) {
            world.fractureEngine.debris.removeEid(result.shards[i]._physId, spatialFrame);
        }
        assert.ok(FractureEngine.fracturePropOnImpact(prop, 0, 0, 30, world.fractureEngine));
        const spawnedAgain = world.fractureEngine.debris.spawnShardsFromFracture(prop);
        for (const body of spawnedAgain) {
            assert.ok(originalBodies.includes(body));
        }
    });
});
