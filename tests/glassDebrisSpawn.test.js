import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FractureEngine } from "../Libraries/Physics/fracture.js";
import { getBaseSpriteCacheKey } from "../Libraries/Props/props.js";
import { quantizeAngleIndex } from "../Libraries/Math/math.js";
import { createFractureWorld, setupGlassPaneForFracture, spawnGlassFractureShards, shatterGlassFootprint } from "./harness/fractureHarness.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { addWorldPropsToState, removeWorldPropFromState } from "../GameState/EntityRegistry.js";
import { setPropVisualTint } from "../Libraries/Color/visualOverride.js";

const spriteCacheKeyDeps = { quantizeAngleIndex };

describe("glass debris slab spawn", () => {
    it("sprite cache footprint key updates when fracture geometry is applied", () => {
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        setupGlassPaneForFracture(prop, 32, 32);
        const before = getBaseSpriteCacheKey(prop, spriteCacheKeyDeps);
        const shards = shatterGlassFootprint(32, 32, 0, 0, 30);
        FractureEngine.applyPropFractureGeometry(prop, shards[0]);
        const after = getBaseSpriteCacheKey(prop, spriteCacheKeyDeps);
        assert.notEqual(before, after);
    });

    it("pooled debris bodies reset wall-chunk presentation before glass spawn", () => {
        const world = createFractureWorld();
        const store = world.fractureEngine.debris;
        const wall = store.acquireBody("wall_voxel_chunk", 0, 0, 0);
        wall.wallChunkProfileId = "stale_profile";
        wall.wallChunkHeightPx = 64;
        wall.height = 48;
        store._pushBody(wall);
        store.remove(wall, { evictKineticProp() {} });
        const glass = store.acquireBody("glass_pane", 10, 10, 0);
        assert.equal(glass.wallChunkProfileId, undefined);
        assert.equal(glass.wallChunkHeightPx, undefined);
        assert.equal(glass.height, 2);
    });

    it("commitFractureResult places glass shards on debris slab not worldProps", () => {
        const world = createFractureWorld();
        const prop = new WorldProp(50, 50, "glass_pane", 0);
        setupGlassPaneForFracture(prop, 32, 32, 0);
        addWorldPropsToState(world, [prop]);
        assert.ok(FractureEngine.fracturePropOnImpact(prop, 50, 50, 30, world.fractureEngine));
        const spatialFrame = { evictKineticProp() {}, admitKineticProps() {} };
        const shards = FractureEngine.commitFractureResult(world, prop, spatialFrame);
        assert.ok(shards.length >= 2);
        assert.ok(shards.every((s) => s.isKineticDebris));
        assert.equal(world.worldProps.length, 0);
        assert.equal(world.fractureEngine.debris.list().length, shards.length);
    });

    it("spawnGlassFractureShards leaves registry empty", () => {
        const world = createFractureWorld();
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        setupGlassPaneForFracture(prop, 32, 32);
        const result = spawnGlassFractureShards(world, prop, 30);
        assert.ok(result);
        assert.ok(result.shards.length >= 2);
        assert.equal(world.worldProps.length, 0);
    });

    it("removeWorldPropFromState does not recycle glass pane into debris pool", () => {
        const world = createFractureWorld();
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        setupGlassPaneForFracture(prop, 32, 32);
        addWorldPropsToState(world, [prop]);
        removeWorldPropFromState(world, prop, world.spatialFrame);
        const pane = new WorldProp(0, 0, "glass_pane", 0);
        setupGlassPaneForFracture(pane, 32, 32);
        const result = spawnGlassFractureShards(world, pane, 30);
        assert.ok(result);
        assert.ok(result.shards.every((s) => s.isKineticDebris));
    });

    it("tinted WorldProp glass shards get matching own visualOverride copies", () => {
        const world = createFractureWorld();
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        setupGlassPaneForFracture(prop, 32, 32);
        setPropVisualTint(prop, "#c44a22");
        const parentVo = prop.visualOverride;
        const result = spawnGlassFractureShards(world, prop, 30);
        assert.ok(result);
        assert.ok(result.shards.length >= 2);
        for (const shard of result.shards) {
            assert.equal(shard.visualOverride.tint, "#c44a22");
            assert.notEqual(shard.visualOverride, parentVo);
        }
        assert.equal(new Set(result.shards.map((s) => s.visualOverride)).size, result.shards.length);
    });

    it("tinted kinetic debris cascade keeps tint after pool reuse", () => {
        const world = createFractureWorld();
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        setupGlassPaneForFracture(prop, 64, 64);
        setPropVisualTint(prop, "#3366aa");
        const first = spawnGlassFractureShards(world, prop, 30);
        assert.ok(first);
        const parent = first.shards.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        const siblingCount = first.shards.length;
        assert.equal(parent.visualOverride.tint, "#3366aa");
        parent._fractureCooldown = 0;
        assert.ok(FractureEngine.fracturePropOnImpact(parent, parent.x, parent.y, 40, world.fractureEngine));
        world.fractureEngine.enqueueDeferredFracture(parent);
        const spatialFrame = { evictKineticProp() {}, admitKineticProps() {} };
        world.fractureEngine.flushDeferredFractures(world, spatialFrame);
        const after = world.fractureEngine.debris.list();
        assert.ok(after.length > siblingCount - 1);
        for (const shard of after) {
            assert.equal(shard.visualOverride.tint, "#3366aa");
        }
        assert.equal(new Set(after.map((s) => s.visualOverride)).size, after.length);
    });
});
