import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FractureEngine } from "../Libraries/Physics/fracture.js";
import { getBaseSpriteCacheKey, applyPropBoxFootprint, propShapeFootprintId } from "../Libraries/Props/props.js";
import { quantizeAngleIndex } from "../Libraries/Math/math.js";
import { createFractureWorld, setupPropForFracture, spawnFractureShards, shatterFootprint } from "./harness/fractureHarness.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { addWorldPropsToState, removeWorldPropFromState } from "../GameState/EntityRegistry.js";
import { setPropVisualTint } from "../Libraries/Color/visualOverride.js";
import { getWallChunkSpriteCacheKey } from "../Libraries/Render/render.js";
import { getPropStaticKey } from "../Libraries/Canvas/canvas.js";

const spriteCacheKeyDeps = { quantizeAngleIndex };

describe("fracture debris slab spawn", () => {
    it("sprite cache footprint key updates when fracture geometry is applied", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        setupPropForFracture(prop, 32, 32);
        const before = getBaseSpriteCacheKey(prop, spriteCacheKeyDeps);
        const shards = shatterFootprint(32, 32, 0, 0, 30);
        FractureEngine.applyPropFractureGeometry(prop, shards[0]);
        const after = getBaseSpriteCacheKey(prop, spriteCacheKeyDeps);
        assert.notEqual(before, after);
    });

    it("distinct irregular shard footprints get distinct sprite cache keys", () => {
        const a = new WorldProp(0, 0, "box", 0);
        const b = new WorldProp(0, 0, "box", 0);
        a.fractureEnabled = true;
        b.fractureEnabled = true;
        FractureEngine.applyPropFractureGeometry(a, {
            footprintVertices: new Float32Array([-10, -8, 12, -7, 9, 11, -11, 6]),
            footprintArea: 200,
            boundingRadius: 16,
        });
        FractureEngine.applyPropFractureGeometry(b, {
            footprintVertices: new Float32Array([-10.4, -8.2, 11.7, -6.8, 8.5, 10.6, -10.7, 5.9]),
            footprintArea: 200,
            boundingRadius: 16,
        });
        assert.notEqual(propShapeFootprintId(a), propShapeFootprintId(b));
        assert.notEqual(getBaseSpriteCacheKey(a, spriteCacheKeyDeps), getBaseSpriteCacheKey(b, spriteCacheKeyDeps));
    });

    it("wall chunk sprite keys include footprint so same profile shards stay distinct", () => {
        const a = new WorldProp(0, 0, "wall_voxel_chunk", 0);
        const b = new WorldProp(0, 0, "wall_voxel_chunk", 0);
        a.wallChunkProfileId = "brick";
        b.wallChunkProfileId = "brick";
        a.wallChunkHeightPx = 24;
        b.wallChunkHeightPx = 24;
        a._wallChunkTextureReady = true;
        b._wallChunkTextureReady = true;
        applyPropBoxFootprint(a, 8, 8);
        applyPropBoxFootprint(b, 10, 6);
        assert.notEqual(getWallChunkSpriteCacheKey(a), getWallChunkSpriteCacheKey(b));
        assert.match(getWallChunkSpriteCacheKey(a), /:ready:\d+$/);
    });

    it("box WorldProp stamps poolTableFelt profile at wall height 1", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        assert.equal(prop.wallChunkProfileId, "poolTableFelt");
        assert.equal(prop.height, 16);
        assert.equal(prop.wallChunkHeightPx, 16);
        assert.equal(prop.strategy.getCustomSpriteCacheKey, getWallChunkSpriteCacheKey);
    });

    it("wall-chunk texture ready flip changes prop static sprite key", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        applyPropBoxFootprint(prop, 16, 16);
        prop._wallChunkTextureReady = false;
        const pendingKey = getPropStaticKey(prop, "box");
        const pendingCustom = getWallChunkSpriteCacheKey(prop);
        assert.match(pendingCustom, /:pending:/);
        prop._wallChunkTextureReady = true;
        const readyKey = getPropStaticKey(prop, "box");
        const readyCustom = getWallChunkSpriteCacheKey(prop);
        assert.match(readyCustom, /:ready:/);
        assert.notEqual(pendingCustom, readyCustom);
        assert.notEqual(pendingKey, readyKey);
    });

    it("pooled debris bodies reset wall-chunk presentation before box spawn", () => {
        const world = createFractureWorld();
        const store = world.fractureEngine.debris;
        const wall = store.acquireBody("wall_voxel_chunk", 0, 0, 0);
        wall.wallChunkProfileId = "stale_profile";
        wall.wallChunkHeightPx = 64;
        wall.height = 48;
        store._pushBody(wall);
        store.remove(wall, { evictKineticProp() {} });
        const glass = store.acquireBody("box", 10, 10, 0);
        assert.equal(glass.wallChunkProfileId, undefined);
        assert.equal(glass.wallChunkHeightPx, undefined);
        assert.equal(glass.height, 7);
    });

    it("commitFractureResult places shards on debris slab not worldProps", () => {
        const world = createFractureWorld();
        const prop = new WorldProp(50, 50, "box", 0);
        setupPropForFracture(prop, 32, 32, 0);
        addWorldPropsToState(world, [prop]);
        assert.ok(FractureEngine.fracturePropOnImpact(prop, 50, 50, 30, world.fractureEngine));
        const spatialFrame = { evictKineticProp() {}, admitKineticProps() {} };
        const shards = FractureEngine.commitFractureResult(world, prop, spatialFrame);
        assert.ok(shards.length >= 2);
        assert.ok(shards.every((s) => s.isKineticDebris));
        assert.equal(world.worldProps.length, 0);
        assert.equal(world.fractureEngine.debris.list().length, shards.length);
    });

    it("spawnFractureShards leaves registry empty", () => {
        const world = createFractureWorld();
        const prop = new WorldProp(0, 0, "box", 0);
        setupPropForFracture(prop, 32, 32);
        const result = spawnFractureShards(world, prop, 30);
        assert.ok(result);
        assert.ok(result.shards.length >= 2);
        assert.equal(world.worldProps.length, 0);
    });

    it("removeWorldPropFromState does not recycle box into debris pool", () => {
        const world = createFractureWorld();
        const prop = new WorldProp(0, 0, "box", 0);
        setupPropForFracture(prop, 32, 32);
        addWorldPropsToState(world, [prop]);
        removeWorldPropFromState(world, prop, world.spatialFrame);
        const pane = new WorldProp(0, 0, "box", 0);
        setupPropForFracture(pane, 32, 32);
        const result = spawnFractureShards(world, pane, 30);
        assert.ok(result);
        assert.ok(result.shards.every((s) => s.isKineticDebris));
    });

    it("tinted WorldProp shards get matching own visualOverride copies", () => {
        const world = createFractureWorld();
        const prop = new WorldProp(0, 0, "box", 0);
        setupPropForFracture(prop, 32, 32);
        setPropVisualTint(prop, "#c44a22");
        const parentVo = prop.visualOverride;
        const result = spawnFractureShards(world, prop, 30);
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
        const prop = new WorldProp(0, 0, "box", 0);
        setupPropForFracture(prop, 64, 64);
        setPropVisualTint(prop, "#3366aa");
        const first = spawnFractureShards(world, prop, 30);
        assert.ok(first);
        const parent = first.shards.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        const siblingCount = first.shards.length;
        assert.equal(parent.visualOverride.tint, "#3366aa");
        parent._fractureCooldown = 0;
        parent.fractureEnabled = true;
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
