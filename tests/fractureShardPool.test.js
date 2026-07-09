import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FractureEngine } from "../Libraries/Physics/fracture.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandbox.js";
import { createFractureWorld, removeEditorPropFromWorld, setupGlassPaneForFracture, spawnGlassFractureShards } from "./harness/fractureHarness.js";

describe("fracture debris slab ownership", () => {
    it("editor spawn and delete does not feed debris slab pool", () => {
        const world = createFractureWorld();
        const prop = spawnPlacedSandboxProp(world, 0, 0, "glass_pane", null, 0);
        const editorId = prop.id;
        removeEditorPropFromWorld(world, prop);
        const pane = new WorldProp(0, 0, "glass_pane", 0);
        setupGlassPaneForFracture(pane, 32, 32);
        const result = spawnGlassFractureShards(world, pane, 30);
        assert.ok(result);
        assert.ok(result.shards.length >= 2);
        for (const shard of result.shards) {
            assert.equal(shard.isKineticDebris, true);
            assert.ok(shard.id !== editorId);
        }
        assert.equal(world.worldProps.length, 0);
    });

    it("debris slab bodies are pooled and reused after removal", () => {
        const world = createFractureWorld();
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        setupGlassPaneForFracture(prop, 32, 32);
        const result = spawnGlassFractureShards(world, prop, 30);
        assert.ok(result);
        const originalBodies = result.shards.slice();
        const spatialFrame = { evictKineticProp() {} };
        for (let i = result.shards.length - 1; i >= 0; i--) {
            world.fractureEngine.debris.remove(result.shards[i], spatialFrame);
        }
        const fractureAgain = FractureEngine.fracturePropOnImpact(prop, 0, 0, 30);
        const stores = fractureAgain._stores ?? world.fractureEngine.stores;
        const spawnedAgain = world.fractureEngine.debris.spawnShardsFromFracture(prop, fractureAgain, stores);
        for (const body of spawnedAgain) {
            assert.ok(originalBodies.includes(body));
        }
    });
});
