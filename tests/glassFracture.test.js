import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Entities/WorldProp.js";
import { applyPropBoxFootprint } from "../Libraries/Props/propStrategy.js";
import { applyShardGeometryToProp, canFracturePropSplit, fracturePropOnImpact, spawnGlassShatterShards, flushDeferredFractures, processKineticContactFractures, impactForceFromContact, queueFractureKineticContact } from "../Libraries/Props/fractureSystem.js";
function tryFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, relativeSpeed) {
    const force = impactForceFromContact(relativeSpeed, bodyA.mass, bodyB.mass);
    queueFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, force);
    flushDeferredFractures(tick.world, tick.frame);
}
import { GLASS_MAX_SHARDS_PER_SHATTER, GLASS_MAX_SLIVER_ASPECT, measureGlassShard, minShardAreaForPolygon, shatterGlassFootprint, shatterGlassPolygon } from "../Libraries/Props/fractureSystem.js";
import { transformPoint2DInto } from "../Libraries/Math/Poly2D.js";
import { satCheckCollision, entityFacing } from "../Libraries/Physics/physics.js";
import { PolygonShape } from "../Libraries/Physics/physics.js";
import { createKineticTestTick } from "./harness/kineticTickHarness.js";
import { kineticDynamicSlab } from "../Libraries/Physics/physics.js";
import { resolveKineticContactPassWithEffects } from "./harness/kineticContactHarness.js";
import { runCollisionPipeline } from "../Libraries/Physics/physics.js";
import propCatalog from "../Assets/props/index.js";
const originalMathRandom = Math.random;
Math.random = () => 0.5;
const deterministicRandom = () => 0.5;
function shardWorldBody(originX, originY, facing, geom) {
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const world = transformPoint2DInto({ x: 0, y: 0 }, originX, originY, geom.centroid.cx, geom.centroid.cy, cos, sin);
    const flat = geom.footprintVertices;
    const count = flat.length;
    const verts = new Float32Array(count);
    const outPoint = { x: 0, y: 0 };
    for (let i = 0; i < count; i += 2) {
        transformPoint2DInto(outPoint, world.x, world.y, flat[i], flat[i + 1], cos, sin);
        verts[i] = outPoint.x;
        verts[i + 1] = outPoint.y;
    }
    return { x: world.x, y: world.y, facing, verts };
}
function countSpawnOverlaps(debris, originX = 0, originY = 0, facing = 0) {
    let overlaps = 0;
    for (let i = 0; i < debris.length; i++)
        for (let j = i + 1; j < debris.length; j++) {
            const a = shardWorldBody(originX, originY, facing, debris[i]);
            const b = shardWorldBody(originX, originY, facing, debris[j]);
            const bodyA = { x: a.x, y: a.y, facing: a.facing };
            const bodyB = { x: b.x, y: b.y, facing: b.facing };
            if (satCheckCollision(bodyA.x, bodyA.y, bodyA.facing, new PolygonShape(a.verts), bodyB.x, bodyB.y, bodyB.facing, new PolygonShape(b.verts))) overlaps++;
        }
    return overlaps;
}
function analyzeShards(shards, parentArea) {
    let totalArea = 0;
    let maxAspect = 0;
    let minThin = Infinity;
    for (const shard of shards) {
        const metrics = measureGlassShard(shard.footprintVertices);
        totalArea += metrics.area;
        maxAspect = Math.max(maxAspect, metrics.aspect);
        minThin = Math.min(minThin, metrics.thin);
    }
    return { totalArea, maxAspect, minThin, count: shards.length };
}
function liveGlassPropCount(world) {
    return world.worldProps.length;
}
function makeOverlappingGlassShards() {
    const shards = shatterGlassFootprint(20, 14, 0, 0, 40, deterministicRandom);
    const a = new WorldProp(0, 0, "glass_pane", 0);
    const b = new WorldProp(8, 0, "glass_pane", 0);
    applyShardGeometryToProp(a, shards[0]);
    applyShardGeometryToProp(b, shards[1] ?? shards[0]);
    a._glassFractureCooldown = 0;
    b._glassFractureCooldown = 0;
    a.vx = 120;
    b.vx = -120;
    assert.ok(satCheckCollision(a.x, a.y, entityFacing(a), a.shape, b.x, b.y, entityFacing(b), b.shape));
    return { a, b };
}
describe("glass fracture", () => {
    it("glass_pane asset uses glass fracture mode and resizable spawn", () => {
        const asset = propCatalog["glass_pane"];
        assert.equal(asset.physics.fracture.mode, "glass");
        assert.ok(asset.sandbox.resizableBox);
    });
    it("glass pane init has no poxel tessellation", () => {
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        assert.equal(prop.poxels, undefined);
        assert.equal(prop.shape.vertices.length / 2, 4);
        assert.ok(canFracturePropSplit(prop));
    });
    it("shatterGlassFootprint produces radial shards without poxels", () => {
        const shards = shatterGlassFootprint(12, 8, 2, -1, 20, deterministicRandom);
        assert.ok(shards.length >= 4);
        for (const shard of shards) {
            assert.ok(shard.footprintArea > 0);
            assert.ok(shard.footprintVertices.length >= 6);
            assert.ok(shard.centroid);
        }
    });
    it("fracturePropOnImpact returns all shards for glass and no parent geometry", () => {
        const prop = new WorldProp(50, 50, "glass_pane", 0);
        prop._physId = 0;
        kineticDynamicSlab.x[0] = 50;
        kineticDynamicSlab.y[0] = 50;
        applyPropBoxFootprint(prop, 16, 10);
        const fracture = fracturePropOnImpact(prop, 50, 50, 25);
        assert.ok(fracture);
        assert.ok(fracture.debris.length >= 4);
        assert.ok(fracture.impactLocal);
        assert.equal(prop.poxels, undefined);
    });
    it("glass shard fractures again on its actual polygon footprint", () => {
        const shards = shatterGlassFootprint(12, 8, 0, 0, 30, deterministicRandom);
        const big = shards.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        prop._physId = 0;
        kineticDynamicSlab.x[0] = 0;
        kineticDynamicSlab.y[0] = 0;
        applyShardGeometryToProp(prop, big);
        assert.ok(canFracturePropSplit(prop));
        const fracture = fracturePropOnImpact(prop, 0, 0, 25);
        assert.ok(fracture);
        assert.ok(fracture.debris.length >= 2);
        for (const piece of fracture.debris) assert.ok(piece.footprintArea < big.footprintArea);
    });
    it("shatterGlassPolygon splits non-rect shard geometry", () => {
        const parentShards = shatterGlassFootprint(10, 6, 1, 0, 25, deterministicRandom);
        const shard = parentShards.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        const again = shatterGlassPolygon(shard.footprintVertices, 0, 0, 25, deterministicRandom);
        assert.ok(again.length >= 2);
    });
    it("tiny glass pieces stop splitting at min size", () => {
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        applyPropBoxFootprint(prop, 2, 2);
        assert.equal(canFracturePropSplit(prop), false);
    });
    it("128x128 shatter stays bounded and avoids needle slivers", () => {
        const parentArea = 128 * 128;
        const hits = [
            [0, 0],
            [30, 50],
            [60, 60],
            [63, 0],
            [-50, 40],
        ];
        for (const [hitX, hitY] of hits) {
            const shards = shatterGlassFootprint(64, 64, hitX, hitY, 25, deterministicRandom);
            const stats = analyzeShards(shards, parentArea);
            assert.ok(stats.count >= 4, `hit ${hitX},${hitY} produced too few shards`);
            assert.ok(stats.count <= GLASS_MAX_SHARDS_PER_SHATTER, `hit ${hitX},${hitY} exceeded shard cap`);
            assert.ok(stats.maxAspect <= GLASS_MAX_SLIVER_ASPECT, `hit ${hitX},${hitY} aspect ${stats.maxAspect}`);
            assert.ok(stats.minThin >= 3, `hit ${hitX},${hitY} thin edge ${stats.minThin}`);
            assert.ok(Math.abs(stats.totalArea - parentArea) < parentArea * 0.08, `hit ${hitX},${hitY} area loss`);
            assert.equal(countSpawnOverlaps(shards), 0, `hit ${hitX},${hitY} spawn overlap`);
        }
    });
    it("128x128 cascade from largest shard stays bounded for two generations", () => {
        let shard = shatterGlassFootprint(64, 64, 0, 0, 25, deterministicRandom).reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        for (let gen = 1; gen <= 2; gen++) {
            const pieces = shatterGlassPolygon(shard.footprintVertices, 0, 0, 25, deterministicRandom);
            const stats = analyzeShards(pieces, shard.footprintArea);
            assert.ok(stats.count >= 2);
            assert.ok(stats.count <= GLASS_MAX_SHARDS_PER_SHATTER);
            assert.ok(stats.maxAspect <= GLASS_MAX_SLIVER_ASPECT);
            assert.equal(countSpawnOverlaps(pieces), 0);
            shard = pieces.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        }
    });
    it("128x128 min shard area scales with pane size", () => {
        const minArea = minShardAreaForPolygon(new Float32Array([-64, -64, 64, -64, 64, 64, -64, 64]));
        assert.ok(minArea > 900);
        const shards = shatterGlassFootprint(64, 64, 0, 0, 25, deterministicRandom);
        const largest = shards.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        assert.ok(largest.footprintArea >= minArea * 0.5);
    });
    it("spawnGlassShatter sets fracture cooldown on new shards", () => {
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        prop._physId = 0;
        kineticDynamicSlab.x[0] = 0;
        kineticDynamicSlab.y[0] = 0;
        applyPropBoxFootprint(prop, 32, 32);
        const fracture = fracturePropOnImpact(prop, 0, 0, 30);
        assert.ok(fracture);
        const spawned = [];
        const state = {
            worldProps: spawned,
            entityRegistry: {
                register(_kind, frag) {
                    spawned.push(frag);
                },
                beginMembershipBatch() {},
                endMembershipBatch() {},
            },
        };
        spawnGlassShatterShards(state, prop, fracture, { admitKineticProps() {}, admitKineticProp() {}, entityGrid: { remove() {} } });
        assert.ok(spawned.length >= 2);
        for (const frag of spawned) assert.ok(frag._glassFractureCooldown > 0);
    });
    it("glass shard on glass shard does not reproduce on kinetic contact", () => {
        const { a, b } = makeOverlappingGlassShards();
        const tick = createKineticTestTick([a, b]);
        tryFractureKineticContact(tick, a, b, 4, 0, 240);
        assert.equal(liveGlassPropCount(tick.world), 2);
    });
    it("resolveKineticContactPassWithEffects keeps glass shard count stable across substeps", () => {
        const { a, b } = makeOverlappingGlassShards();
        const tick = createKineticTestTick([a, b]);
        for (let step = 0; step < 8; step++) {
            resolveKineticContactPassWithEffects(tick);
            assert.equal(liveGlassPropCount(tick.world), 2, `reproduced on substep ${step}`);
        }
    });
    it("glass shard still shatters against a non-glass kinetic prop", () => {
        const shards = shatterGlassFootprint(24, 18, 0, 0, 40, deterministicRandom);
        const glass = new WorldProp(0, 0, "glass_pane", 0);
        const crate = new WorldProp(14, 0, "crate", 0);
        applyShardGeometryToProp(glass, shards[0]);
        glass._glassFractureCooldown = 0;
        glass.vx = 120;
        crate.vx = -40;
        const tick = createKineticTestTick([glass, crate]);
        assert.ok(satCheckCollision(glass.x, glass.y, entityFacing(glass), glass.shape, crate.x, crate.y, entityFacing(crate), crate.shape));
        resolveKineticContactPassWithEffects(tick);
        assert.ok(liveGlassPropCount(tick.world) > 2);
        assert.ok(!tick.world.worldProps.includes(glass) || glass._glassFractureCooldown > 0);
    });
    it("runCollisionPipeline does not reproduce glass across persisted pair iterations", () => {
        const glass = new WorldProp(0, 0, "glass_pane", 0);
        const ball = new WorldProp(18, 0, "ball", 0);
        applyPropBoxFootprint(glass, 24, 18);
        glass.vx = 0;
        ball.vx = -200;
        assert.ok(satCheckCollision(glass.x, glass.y, entityFacing(glass), glass.shape, ball.x, ball.y, entityFacing(ball), ball.shape));
        const tick = createKineticTestTick([glass, ball]);
        runCollisionPipeline(tick, { resolveWalls() {}, applyContactSideEffects: processKineticContactFractures });
        const count = liveGlassPropCount(tick.world);
        assert.ok(count > 2);
        assert.ok(count <= GLASS_MAX_SHARDS_PER_SHATTER + 2);
        assert.ok(!tick.world.worldProps.includes(glass) || glass._glassFractureCooldown > 0);
    });
    it("shattered glass shards conserve the total area of the parent shape without gaps", () => {
        const flat = new Float32Array([-16, -16, 16, -16, 16, 16, -16, 16]);
        const parentArea = 32 * 32; // 1024
        // Shatter at various points and verify the total area matches
        for (let i = 0; i < 5; i++) {
            const hitX = (Math.random() - 0.5) * 20;
            const hitY = (Math.random() - 0.5) * 20;
            const shards = shatterGlassPolygon(flat, hitX, hitY, 30, Math.random);
            assert.ok(shards.length >= 2, "Should produce at least 2 shards");
            let totalArea = 0;
            for (const shard of shards) totalArea += shard.footprintArea;
            assert.ok(Math.abs(totalArea - parentArea) < 1e-3, `Expected total area close to ${parentArea}, got ${totalArea}`);
        }
    });
});
Math.random = originalMathRandom;
