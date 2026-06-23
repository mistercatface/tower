import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Entities/WorldProp.js";
import { applyPropBoxFootprint } from "../Libraries/Props/propStrategy.js";
import { applyShardGeometryToProp, canFracturePropSplit, fracturePropOnImpact, tryFractureKineticContact } from "../Libraries/Props/propFracture.js";
import {
    GLASS_MAX_SHARDS_PER_SHATTER,
    GLASS_MAX_SLIVER_ASPECT,
    measureGlassShard,
    minShardAreaForPolygon,
    shatterGlassFootprint,
    shatterGlassPolygon,
} from "../Libraries/Props/glassFracture.js";
import { worldPropAssets } from "../Libraries/Props/PropCatalog.js";
import { transformPoint2DInto } from "../Libraries/Math/Poly2D.js";
import { SatCollision } from "../Libraries/Spatial/collision/SatCollision.js";
import { PolygonShape } from "../Libraries/Spatial/collision/Shapes.js";
import { createKineticTestTick } from "./harness/kineticTickHarness.js";
import { resolveKineticContactPassWithEffects } from "./harness/kineticContactHarness.js";
import { runCollisionPipeline } from "../Libraries/Spatial/collision/collisionPipeline.js";

const deterministicRandom = () => 0.5;

function shardWorldBody(originX, originY, facing, geom) {
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const world = transformPoint2DInto({ x: 0, y: 0 }, originX, originY, geom.centroid.cx, geom.centroid.cy, cos, sin);
    const verts = [];
    const flat = geom.footprintVertices;
    for (let i = 0; i < flat.length / 2; i++) {
        verts.push(transformPoint2DInto({ x: 0, y: 0 }, world.x, world.y, flat[i * 2], flat[i * 2 + 1], cos, sin));
    }
    return { x: world.x, y: world.y, facing, verts };
}

function countSpawnOverlaps(debris, originX = 0, originY = 0, facing = 0) {
    let overlaps = 0;
    for (let i = 0; i < debris.length; i++) {
        for (let j = i + 1; j < debris.length; j++) {
            const a = shardWorldBody(originX, originY, facing, debris[i]);
            const b = shardWorldBody(originX, originY, facing, debris[j]);
            const bodyA = { x: a.x, y: a.y, facing: a.facing };
            const bodyB = { x: b.x, y: b.y, facing: b.facing };
            if (SatCollision.checkCollision(bodyA, new PolygonShape(a.verts), bodyB, new PolygonShape(b.verts))) overlaps++;
        }
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
    assert.ok(SatCollision.checkCollision(a, a.getShape(), b, b.getShape()));
    return { a, b };
}

describe("glass fracture", () => {
    it("glass_pane asset uses glass fracture mode and resizable spawn", () => {
        const asset = worldPropAssets["glass_pane"];
        assert.equal(asset.physics.fractureMode, "glass");
        assert.ok(asset.sandbox.resizableBox);
    });

    it("glass pane init has no poxel tessellation", () => {
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        assert.equal(prop.poxels, undefined);
        assert.equal(prop.shape.vertices.length, 4);
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
        let shard = shatterGlassFootprint(64, 64, 0, 0, 25, deterministicRandom).reduce((a, b) =>
            a.footprintArea > b.footprintArea ? a : b,
        );
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
        const minArea = minShardAreaForPolygon([
            { x: -64, y: -64 },
            { x: 64, y: -64 },
            { x: 64, y: 64 },
            { x: -64, y: 64 },
        ]);
        assert.ok(minArea > 900);
        const shards = shatterGlassFootprint(64, 64, 0, 0, 25, deterministicRandom);
        const largest = shards.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        assert.ok(largest.footprintArea >= minArea * 0.5);
    });

    it("spawnGlassShatter sets fracture cooldown on new shards", () => {
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        applyPropBoxFootprint(prop, 32, 32);
        const fracture = fracturePropOnImpact(prop, 0, 0, 30);
        assert.ok(fracture);
        const spawned = [];
        const state = {
            worldProps: spawned,
            entityRegistry: { register(_kind, frag) { spawned.push(frag); } },
        };
        prop.spawnGlassShatter(state, fracture, { admitKineticProp() {}, entityGrid: { remove() {} } });
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
        assert.ok(SatCollision.checkCollision(glass, glass.getShape(), crate, crate.getShape()));
        resolveKineticContactPassWithEffects(tick);
        assert.ok(liveGlassPropCount(tick.world) > 2);
        assert.ok(!tick.world.worldProps.includes(glass));
    });

    it("runCollisionPipeline does not reproduce glass across persisted pair iterations", () => {
        const glass = new WorldProp(0, 0, "glass_pane", 0);
        const ball = new WorldProp(18, 0, "ball", 0);
        applyPropBoxFootprint(glass, 24, 18);
        glass.vx = 0;
        ball.vx = -200;
        assert.ok(SatCollision.checkCollision(glass, glass.getShape(), ball, ball.getShape()));
        const tick = createKineticTestTick([glass, ball]);
        runCollisionPipeline(tick, { resolveWalls() {} });
        const count = liveGlassPropCount(tick.world);
        assert.ok(count > 2);
        assert.ok(count <= GLASS_MAX_SHARDS_PER_SHATTER + 2);
        assert.ok(!tick.world.worldProps.includes(glass));
    });
});
