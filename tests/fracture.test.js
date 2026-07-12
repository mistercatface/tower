import { FractureEngine } from "../Libraries/Physics/fracture.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { applyPropBoxFootprint } from "../Libraries/Props/props.js";
function tryFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, relativeSpeed) {
    const force = FractureEngine.impactForceFromContact(relativeSpeed, kineticMass(bodyA), kineticMass(bodyB));
    tick.world.fractureEngine.queueFractureKineticContact(bodyA, bodyB, hitX, hitY, force);
    tick.world.fractureEngine.flushDeferredFractures(tick.world, tick.frame);
}
import { FRACTURE_MAX_SHARDS_PER_SHATTER } from "../Libraries/Physics/fracture.js";
import { transformPoint2DIntoF32 } from "../Libraries/Math/math.js";
import { ENGINE_F32, F_OUT_DEBRIS_START, F_OUT_DEBRIS_COUNT, F_OUT_AREA, F_OUT_IMPACT_LOCAL_X, F_OUT_IMPACT_LOCAL_Y } from "../Core/engineMemory.js";
import { satCheckCollision, readEntityFacing, kineticMass } from "../Libraries/Physics/physics.js";
import { PolygonShape } from "../Libraries/Physics/physics.js";
import { createKineticTestTick, assignPhysIdWithPose } from "./harness/kineticTickHarness.js";
import { liveFracturePropCount, createFractureWorld, setupPropForFracture, spawnFractureShards, shatterFootprint, shatterPolygon, materializeDebrisGeometries } from "./harness/fractureHarness.js";
import { resolveKineticContactPassWithEffects } from "./harness/kineticContactHarness.js";
import { runCollisionPipeline } from "../Libraries/Physics/physics.js";
import propCatalog from "../Assets/props/index.js";
import { DEFAULT_CAMERA_HEIGHT, DEFAULT_PERSPECTIVE_STRENGTH } from "../Core/GamePerspective.js";
const originalMathRandom = Math.random;
Math.random = () => 0.5;
const deterministicRandom = () => 0.5;
function shardWorldBody(originX, originY, facing, geom) {
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const worldBuf = new Float32Array(2);
    transformPoint2DIntoF32(worldBuf, 0, originX, originY, geom.centroid.cx, geom.centroid.cy, cos, sin);
    const worldX = worldBuf[0];
    const worldY = worldBuf[1];
    const flat = geom.footprintVertices;
    const count = flat.length;
    const verts = new Float32Array(count);
    const outPoint = new Float32Array(2);
    for (let i = 0; i < count; i += 2) {
        transformPoint2DIntoF32(outPoint, 0, worldX, worldY, flat[i], flat[i + 1], cos, sin);
        verts[i] = outPoint[0];
        verts[i + 1] = outPoint[1];
    }
    return { x: worldX, y: worldY, facing, verts };
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
        const metrics = FractureEngine.measureFractureShard(shard.footprintVertices);
        totalArea += metrics.area;
        maxAspect = Math.max(maxAspect, metrics.aspect);
        minThin = Math.min(minThin, metrics.thin);
    }
    return { totalArea, maxAspect, minThin, count: shards.length };
}
function makeOverlappingFractureShards() {
    const shards = shatterFootprint(20, 14, 0, 0, 40);
    const a = new WorldProp(0, 0, "box", 0);
    const b = new WorldProp(8, 0, "box", 0);
    a.fractureEnabled = true;
    b.fractureEnabled = true;
    FractureEngine.applyPropFractureGeometry(a, shards[0]);
    FractureEngine.applyPropFractureGeometry(b, shards[1] ?? shards[0]);
    a._fractureCooldown = 0;
    b._fractureCooldown = 0;
    a.vx = 120;
    b.vx = -120;
    assert.ok(satCheckCollision(a.x, a.y, readEntityFacing(a), a.shape, b.x, b.y, readEntityFacing(b), b.shape));
    return { a, b };
}
describe("fracture", () => {
    it("box asset is resizable without baked fracture", () => {
        const asset = propCatalog["box"];
        assert.equal(asset.physics.fracture, undefined);
        assert.ok(asset.sandbox.resizableBox);
        assert.equal(asset.visuals, undefined);
    });
    it("box polygon draw recipe is flat in 2d and extruded in radial", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        setupPropForFracture(prop, 12, 8);
        assert.equal(prop.wallChunkProfileId, "poolTableFelt");
        const draw = propCatalog["box"].drawRecipe;
        const calls = { beginPath: 0, fill: 0, stroke: 0, fillStyle: null };
        const viewport = {
            x: 0,
            y: 0,
            zoom: 1,
            cameraHeight: DEFAULT_CAMERA_HEIGHT,
            perspectiveStrength: DEFAULT_PERSPECTIVE_STRENGTH,
        };
        const ctx = {
            beginPath() { calls.beginPath++; },
            fill() { calls.fill++; },
            stroke() { calls.stroke++; },
            set fillStyle(v) { calls.fillStyle = v; },
            get fillStyle() { return calls.fillStyle; },
            strokeStyle: null,
            lineWidth: 1,
            moveTo() {},
            lineTo() {},
            closePath() {},
            createLinearGradient() { return { addColorStop() {} }; },
        };
        calls.beginPath = 0;
        calls.fill = 0;
        calls.stroke = 0;
        draw(ctx, prop, viewport, true);
        assert.equal(calls.beginPath, 1);
        assert.equal(calls.fill, 1);
        assert.ok(calls.fillStyle);
        assert.equal(calls.stroke, 0);

        calls.beginPath = 0;
        calls.fill = 0;
        calls.stroke = 0;
        draw(ctx, prop, viewport, false);
        assert.ok(calls.fill > 1);
        assert.equal(calls.stroke, 0);
    });
    it("box init has no poxel tessellation", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        prop.fractureEnabled = true;
        assert.equal(prop.poxels, undefined);
        assert.equal(prop.shape.vertices.length / 2, 4);
        assert.ok(FractureEngine.canFracturePropSplit(prop));
    });
    it("shatterFootprint produces radial shards without poxels", () => {
        const shards = shatterFootprint(12, 8, 2, -1, 20);
        assert.ok(shards.length >= 4);
        for (const shard of shards) {
            assert.ok(shard.footprintArea > 0);
            assert.ok(shard.footprintVertices.length >= 6);
            assert.ok(shard.centroid);
        }
    });
    it("fracturePropOnImpact returns all shards and no parent geometry", () => {
        const world = createFractureWorld();
        const prop = new WorldProp(50, 50, "box", 0);
        setupPropForFracture(prop, 16, 10, 0);
        assert.ok(FractureEngine.fracturePropOnImpact(prop, 50, 50, 25, world.fractureEngine));
        const stores = world.fractureEngine.stores;
        const debrisStart = ENGINE_F32[F_OUT_DEBRIS_START];
        const debrisCount = ENGINE_F32[F_OUT_DEBRIS_COUNT];
        assert.ok(debrisCount >= 2);
        assert.ok(materializeDebrisGeometries(stores, debrisStart, debrisCount).length >= 4);
        assert.ok(Number.isFinite(ENGINE_F32[F_OUT_IMPACT_LOCAL_X]));
        assert.ok(Number.isFinite(ENGINE_F32[F_OUT_IMPACT_LOCAL_Y]));
        assert.equal(prop.poxels, undefined);
    });
    it("shatterPolygon outside-hit path builds seeds via ENGINE_F32 centroid Into", () => {
        const flat = new Float32Array([-12, -8, 12, -8, 12, 8, -12, 8]);
        const shards = shatterPolygon(flat, 80, 80, 25);
        assert.ok(shards.length >= 2);
        assert.ok(ENGINE_F32[F_OUT_DEBRIS_COUNT] >= 2);
        assert.ok(ENGINE_F32[F_OUT_AREA] > 0);
        for (const shard of shards) {
            assert.ok(shard.footprintArea > 0);
            assert.ok(Number.isFinite(shard.centroid.cx));
            assert.ok(Number.isFinite(shard.centroid.cy));
        }
    });
    it("shard fractures again on its actual polygon footprint", () => {
        const world = createFractureWorld();
        const shards = shatterFootprint(12, 8, 0, 0, 30);
        const big = shards.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        const prop = new WorldProp(0, 0, "box", 0);
        prop.fractureEnabled = true;
        assignPhysIdWithPose(prop, 0);
        FractureEngine.applyPropFractureGeometry(prop, big);
        assert.ok(FractureEngine.canFracturePropSplit(prop));
        assert.ok(FractureEngine.fracturePropOnImpact(prop, 0, 0, 25, world.fractureEngine));
        const debris = materializeDebrisGeometries(world.fractureEngine.stores, ENGINE_F32[F_OUT_DEBRIS_START], ENGINE_F32[F_OUT_DEBRIS_COUNT]);
        assert.ok(debris.length >= 2);
        for (const piece of debris) assert.ok(piece.footprintArea < big.footprintArea);
    });
    it("shatterPolygon splits non-rect shard geometry", () => {
        const parentShards = shatterFootprint(10, 6, 1, 0, 25);
        const shard = parentShards.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        const again = shatterPolygon(shard.footprintVertices, 0, 0, 25);
        assert.ok(again.length >= 2);
    });
    it("tiny pieces stop splitting at min size", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        prop.fractureEnabled = true;
        applyPropBoxFootprint(prop, 2, 2);
        assert.equal(FractureEngine.canFracturePropSplit(prop), false);
    });
    it("128x128 shatter stays bounded and conserves area exactly", () => {
        const parentArea = 128 * 128;
        const hits = [
            [0, 0],
            [30, 50],
            [60, 60],
            [63, 0],
            [-50, 40],
        ];
        for (const [hitX, hitY] of hits) {
            const shards = shatterFootprint(64, 64, hitX, hitY, 25);
            const stats = analyzeShards(shards, parentArea);
            assert.ok(stats.count >= 4, `hit ${hitX},${hitY} produced too few shards`);
            assert.ok(stats.count <= FRACTURE_MAX_SHARDS_PER_SHATTER, `hit ${hitX},${hitY} exceeded shard cap`);
            assert.ok(Math.abs(stats.totalArea - parentArea) < parentArea * 1e-3, `hit ${hitX},${hitY} area loss`);
            assert.equal(countSpawnOverlaps(shards), 0, `hit ${hitX},${hitY} spawn overlap`);
        }
    });
    it("128x128 cascade from largest shard conserves area for two generations", () => {
        let shard = shatterFootprint(64, 64, 0, 0, 25).reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        for (let gen = 1; gen <= 2; gen++) {
            const pieces = shatterPolygon(shard.footprintVertices, 0, 0, 25);
            const stats = analyzeShards(pieces, shard.footprintArea);
            assert.ok(stats.count >= 2);
            assert.ok(stats.count <= FRACTURE_MAX_SHARDS_PER_SHATTER);
            assert.ok(Math.abs(stats.totalArea - shard.footprintArea) < shard.footprintArea * 1e-3, `gen ${gen} area loss`);
            assert.equal(countSpawnOverlaps(pieces), 0);
            shard = pieces.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        }
    });
    it("offset thin rectangle corner hit partitions exactly", () => {
        const flat = new Float32Array([-20, -6, 20, -6, 20, 6, -20, 6]);
        const parentArea = 40 * 12;
        const shards = shatterPolygon(flat, 20, 6, 25);
        const stats = analyzeShards(shards, parentArea);
        assert.ok(stats.count >= 2);
        assert.ok(Math.abs(stats.totalArea - parentArea) < parentArea * 1e-3);
        assert.equal(countSpawnOverlaps(shards), 0);
    });
    it("128x128 min shard area scales with size", () => {
        const minArea = FractureEngine.minShardAreaForPolygon(new Float32Array([-64, -64, 64, -64, 64, 64, -64, 64]));
        assert.ok(minArea > 900);
        const shards = shatterFootprint(64, 64, 0, 0, 25);
        const largest = shards.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        assert.ok(largest.footprintArea >= minArea * 0.5);
    });
    it("spawnFractureShards sets fracture cooldown on new shards", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        setupPropForFracture(prop, 32, 32);
        const world = createFractureWorld();
        const result = spawnFractureShards(world, prop, 30);
        assert.ok(result);
        assert.ok(result.shards.length >= 2);
        for (const frag of result.shards) {
            assert.ok(frag.isKineticDebris);
            assert.ok(frag._fractureCooldown > 0);
        }
        assert.equal(world.worldProps.length, 0);
    });
    it("soft fracture shard on fracture shard stays intact", () => {
        const { a, b } = makeOverlappingFractureShards();
        const tick = createKineticTestTick([a, b]);
        tryFractureKineticContact(tick, a, b, 4, 0, 4);
        assert.equal(liveFracturePropCount(tick.world), 2);
    });
    it("hard fracture shard on large fracture shard can shatter once", () => {
        const a = new WorldProp(0, 0, "box", 0);
        const b = new WorldProp(18, 0, "box", 0);
        a.fractureEnabled = true;
        b.fractureEnabled = true;
        applyPropBoxFootprint(a, 16, 16);
        applyPropBoxFootprint(b, 16, 16);
        a._fractureCooldown = 0;
        b._fractureCooldown = 0;
        const tick = createKineticTestTick([a, b]);
        tryFractureKineticContact(tick, a, b, 8, 0, 240);
        const count = liveFracturePropCount(tick.world);
        assert.ok(count > 2);
        assert.ok(count <= FRACTURE_MAX_SHARDS_PER_SHATTER + 1);
    });
    it("resolveKineticContactPassWithEffects does not powder after a mutual shatter", () => {
        const a = new WorldProp(0, 0, "box", 0);
        const b = new WorldProp(18, 0, "box", 0);
        a.fractureEnabled = true;
        b.fractureEnabled = true;
        applyPropBoxFootprint(a, 16, 16);
        applyPropBoxFootprint(b, 16, 16);
        a.vx = 120;
        b.vx = -120;
        a._fractureCooldown = 0;
        b._fractureCooldown = 0;
        const tick = createKineticTestTick([a, b]);
        assert.ok(satCheckCollision(a.x, a.y, readEntityFacing(a), a.shape, b.x, b.y, readEntityFacing(b), b.shape));
        resolveKineticContactPassWithEffects(tick);
        const afterFirst = liveFracturePropCount(tick.world);
        assert.ok(afterFirst > 2);
        for (let step = 0; step < 7; step++) {
            resolveKineticContactPassWithEffects(tick);
            assert.ok(liveFracturePropCount(tick.world) <= afterFirst + FRACTURE_MAX_SHARDS_PER_SHATTER, `powdered on substep ${step}`);
        }
    });
    it("fracture shard still shatters against a non-fracture kinetic prop", () => {
        const shards = shatterFootprint(24, 18, 0, 0, 40);
        const glass = new WorldProp(0, 0, "box", 0);
        const crate = new WorldProp(14, 0, "box", 0);
        glass.fractureEnabled = true;
        FractureEngine.applyPropFractureGeometry(glass, shards[0]);
        glass._fractureCooldown = 0;
        glass.vx = 120;
        crate.vx = -40;
        const tick = createKineticTestTick([glass, crate]);
        assert.ok(satCheckCollision(glass.x, glass.y, readEntityFacing(glass), glass.shape, crate.x, crate.y, readEntityFacing(crate), crate.shape));
        resolveKineticContactPassWithEffects(tick);
        assert.ok(liveFracturePropCount(tick.world) > 2);
        assert.ok(!tick.world.worldProps.includes(glass) || glass._fractureCooldown > 0);
    });
    it("runCollisionPipeline does not reproduce fracture across persisted pair iterations", () => {
        const glass = new WorldProp(0, 0, "box", 0);
        const ball = new WorldProp(18, 0, "ball", 0);
        glass.fractureEnabled = true;
        applyPropBoxFootprint(glass, 24, 18);
        glass.vx = 0;
        ball.vx = -200;
        assert.ok(satCheckCollision(glass.x, glass.y, readEntityFacing(glass), glass.shape, ball.x, ball.y, readEntityFacing(ball), ball.shape));
        const tick = createKineticTestTick([glass, ball]);
        runCollisionPipeline(tick, () => {}, (t, c) => t.world.fractureEngine.processKineticContactFractures(t, c));
        const count = liveFracturePropCount(tick.world);
        assert.ok(count > 2);
        assert.ok(count <= FRACTURE_MAX_SHARDS_PER_SHATTER + 2);
        assert.ok(!tick.world.worldProps.includes(glass) || glass._fractureCooldown > 0);
    });
    it("shattered shards conserve the total area of the parent shape without gaps", () => {
        const flat = new Float32Array([-16, -16, 16, -16, 16, 16, -16, 16]);
        const parentArea = 32 * 32; // 1024
        // Shatter at various points and verify the total area matches
        for (let i = 0; i < 5; i++) {
            const hitX = (Math.random() - 0.5) * 20;
            const hitY = (Math.random() - 0.5) * 20;
            const shards = shatterPolygon(flat, hitX, hitY, 30);
            assert.ok(shards.length >= 2, "Should produce at least 2 shards");
            let totalArea = 0;
            for (const shard of shards) totalArea += shard.footprintArea;
            assert.ok(Math.abs(totalArea - parentArea) < 1e-3, `Expected total area close to ${parentArea}, got ${totalArea}`);
        }
    });
});
Math.random = originalMathRandom;
