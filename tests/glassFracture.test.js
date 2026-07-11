import { FractureEngine } from "../Libraries/Physics/fracture.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { applyPropBoxFootprint } from "../Libraries/Props/props.js";
function tryFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, relativeSpeed) {
    const force = FractureEngine.impactForceFromContact(relativeSpeed, bodyA.mass, bodyB.mass);
    tick.world.fractureEngine.queueFractureKineticContact(bodyA, bodyB, hitX, hitY, force);
    tick.world.fractureEngine.flushDeferredFractures(tick.world, tick.frame);
}
import { GLASS_MAX_SHARDS_PER_SHATTER, F_OUT_DEBRIS_START, F_OUT_DEBRIS_COUNT, F_OUT_AREA } from "../Libraries/Physics/fracture.js";
import { transformPoint2DIntoF32 } from "../Libraries/Math/math.js";
import { ENGINE_F32 } from "../Core/engineMemory.js";
import { satCheckCollision, readEntityFacing } from "../Libraries/Physics/physics.js";
import { PolygonShape } from "../Libraries/Physics/physics.js";
import { createKineticTestTick, assignPhysIdWithPose } from "./harness/kineticTickHarness.js";
import { liveGlassCount, createFractureWorld, setupGlassPaneForFracture, spawnGlassFractureShards, shatterGlassFootprint, shatterGlassPolygon, materializeDebrisGeometries, readImpactFracture } from "./harness/fractureHarness.js";
import { resolveKineticContactPassWithEffects } from "./harness/kineticContactHarness.js";
import { runCollisionPipeline } from "../Libraries/Physics/physics.js";
import propCatalog from "../Assets/props/index.js";
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
        const metrics = FractureEngine.measureGlassShard(shard.footprintVertices);
        totalArea += metrics.area;
        maxAspect = Math.max(maxAspect, metrics.aspect);
        minThin = Math.min(minThin, metrics.thin);
    }
    return { totalArea, maxAspect, minThin, count: shards.length };
}
function makeOverlappingGlassShards() {
    const shards = shatterGlassFootprint(20, 14, 0, 0, 40);
    const a = new WorldProp(0, 0, "glass_pane", 0);
    const b = new WorldProp(8, 0, "glass_pane", 0);
    FractureEngine.applyPropFractureGeometry(a, shards[0]);
    FractureEngine.applyPropFractureGeometry(b, shards[1] ?? shards[0]);
    a._fractureCooldown = 0;
    b._fractureCooldown = 0;
    a.vx = 120;
    b.vx = -120;
    assert.ok(satCheckCollision(a.x, a.y, readEntityFacing(a), a.shape, b.x, b.y, readEntityFacing(b), b.shape));
    return { a, b };
}
describe("glass fracture", () => {
    it("glass_pane asset uses glass fracture mode and resizable spawn", () => {
        const asset = propCatalog["glass_pane"];
        assert.equal(asset.physics.fracture.mode, "glass");
        assert.ok(asset.sandbox.resizableBox);
        assert.equal(asset.visuals.flat, undefined);
        assert.equal(asset.visuals.flatFill, undefined);
        assert.equal(asset.visuals.lineWidth, undefined);
        assert.equal(asset.visuals.colors.stroke, undefined);
        assert.equal(propCatalog["flat_glass_pane"], undefined);
    });
    it("glass polygon draw recipe uses flat silhouette when flatPresentation", () => {
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        setupGlassPaneForFracture(prop, 12, 8);
        const draw = propCatalog["glass_pane"].drawRecipe;
        const calls = { beginPath: 0, fill: 0, stroke: 0, fillStyle: null };
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
        };
        draw(ctx, prop, { x: 0, y: 0 }, true);
        assert.equal(calls.beginPath, 1);
        assert.equal(calls.fill, 1);
        assert.ok(calls.fillStyle);
        assert.equal(calls.stroke, 0);
    });
    it("glass pane init has no poxel tessellation", () => {
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        assert.equal(prop.poxels, undefined);
        assert.equal(prop.shape.vertices.length / 2, 4);
        assert.ok(FractureEngine.canFracturePropSplit(prop));
    });
    it("shatterGlassFootprint produces radial shards without poxels", () => {
        const shards = shatterGlassFootprint(12, 8, 2, -1, 20);
        assert.ok(shards.length >= 4);
        for (const shard of shards) {
            assert.ok(shard.footprintArea > 0);
            assert.ok(shard.footprintVertices.length >= 6);
            assert.ok(shard.centroid);
        }
    });
    it("fracturePropOnImpact returns all shards for glass and no parent geometry", () => {
        const prop = new WorldProp(50, 50, "glass_pane", 0);
        setupGlassPaneForFracture(prop, 16, 10, 0);
        assert.ok(FractureEngine.fracturePropOnImpact(prop, 50, 50, 25));
        const fracture = readImpactFracture();
        assert.equal(ENGINE_F32[F_OUT_DEBRIS_START], fracture.debrisStart);
        assert.equal(ENGINE_F32[F_OUT_DEBRIS_COUNT], fracture.debrisCount);
        assert.ok(fracture.debrisCount >= 2);
        assert.ok(materializeDebrisGeometries(fracture._stores, fracture.debrisStart, fracture.debrisCount).length >= 4);
        assert.ok(Number.isFinite(fracture.impactLocalX));
        assert.ok(Number.isFinite(fracture.impactLocalY));
        assert.equal(prop.poxels, undefined);
    });
    it("shatterGlassPolygon outside-hit path builds seeds via ENGINE_F32 centroid Into", () => {
        const flat = new Float32Array([-12, -8, 12, -8, 12, 8, -12, 8]);
        const shards = shatterGlassPolygon(flat, 80, 80, 25);
        assert.ok(shards.length >= 2);
        assert.ok(ENGINE_F32[F_OUT_DEBRIS_COUNT] >= 2);
        assert.ok(ENGINE_F32[F_OUT_AREA] > 0);
        for (const shard of shards) {
            assert.ok(shard.footprintArea > 0);
            assert.ok(Number.isFinite(shard.centroid.cx));
            assert.ok(Number.isFinite(shard.centroid.cy));
        }
    });
    it("glass shard fractures again on its actual polygon footprint", () => {
        const shards = shatterGlassFootprint(12, 8, 0, 0, 30);
        const big = shards.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        assignPhysIdWithPose(prop, 0);
        FractureEngine.applyPropFractureGeometry(prop, big);
        assert.ok(FractureEngine.canFracturePropSplit(prop));
        assert.ok(FractureEngine.fracturePropOnImpact(prop, 0, 0, 25));
        const fracture = readImpactFracture();
        const debris = materializeDebrisGeometries(fracture._stores, fracture.debrisStart, fracture.debrisCount);
        assert.ok(debris.length >= 2);
        for (const piece of debris) assert.ok(piece.footprintArea < big.footprintArea);
    });
    it("shatterGlassPolygon splits non-rect shard geometry", () => {
        const parentShards = shatterGlassFootprint(10, 6, 1, 0, 25);
        const shard = parentShards.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        const again = shatterGlassPolygon(shard.footprintVertices, 0, 0, 25);
        assert.ok(again.length >= 2);
    });
    it("tiny glass pieces stop splitting at min size", () => {
        const prop = new WorldProp(0, 0, "glass_pane", 0);
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
            const shards = shatterGlassFootprint(64, 64, hitX, hitY, 25);
            const stats = analyzeShards(shards, parentArea);
            assert.ok(stats.count >= 4, `hit ${hitX},${hitY} produced too few shards`);
            assert.ok(stats.count <= GLASS_MAX_SHARDS_PER_SHATTER, `hit ${hitX},${hitY} exceeded shard cap`);
            assert.ok(Math.abs(stats.totalArea - parentArea) < parentArea * 1e-3, `hit ${hitX},${hitY} area loss`);
            assert.equal(countSpawnOverlaps(shards), 0, `hit ${hitX},${hitY} spawn overlap`);
        }
    });
    it("128x128 cascade from largest shard conserves area for two generations", () => {
        let shard = shatterGlassFootprint(64, 64, 0, 0, 25).reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        for (let gen = 1; gen <= 2; gen++) {
            const pieces = shatterGlassPolygon(shard.footprintVertices, 0, 0, 25);
            const stats = analyzeShards(pieces, shard.footprintArea);
            assert.ok(stats.count >= 2);
            assert.ok(stats.count <= GLASS_MAX_SHARDS_PER_SHATTER);
            assert.ok(Math.abs(stats.totalArea - shard.footprintArea) < shard.footprintArea * 1e-3, `gen ${gen} area loss`);
            assert.equal(countSpawnOverlaps(pieces), 0);
            shard = pieces.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        }
    });
    it("offset thin rectangle corner hit partitions exactly", () => {
        const flat = new Float32Array([-20, -6, 20, -6, 20, 6, -20, 6]);
        const parentArea = 40 * 12;
        const shards = shatterGlassPolygon(flat, 20, 6, 25);
        const stats = analyzeShards(shards, parentArea);
        assert.ok(stats.count >= 2);
        assert.ok(Math.abs(stats.totalArea - parentArea) < parentArea * 1e-3);
        assert.equal(countSpawnOverlaps(shards), 0);
    });
    it("128x128 min shard area scales with pane size", () => {
        const minArea = FractureEngine.minShardAreaForPolygon(new Float32Array([-64, -64, 64, -64, 64, 64, -64, 64]));
        assert.ok(minArea > 900);
        const shards = shatterGlassFootprint(64, 64, 0, 0, 25);
        const largest = shards.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        assert.ok(largest.footprintArea >= minArea * 0.5);
    });
    it("spawnGlassShatter sets fracture cooldown on new shards", () => {
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        setupGlassPaneForFracture(prop, 32, 32);
        const world = createFractureWorld();
        const result = spawnGlassFractureShards(world, prop, 30);
        assert.ok(result);
        assert.ok(result.shards.length >= 2);
        for (const frag of result.shards) {
            assert.ok(frag.isKineticDebris);
            assert.ok(frag._fractureCooldown > 0);
        }
        assert.equal(world.worldProps.length, 0);
    });
    it("glass shard on glass shard does not reproduce on kinetic contact", () => {
        const { a, b } = makeOverlappingGlassShards();
        const tick = createKineticTestTick([a, b]);
        tryFractureKineticContact(tick, a, b, 4, 0, 240);
        assert.equal(liveGlassCount(tick.world), 2);
    });
    it("resolveKineticContactPassWithEffects keeps glass shard count stable across substeps", () => {
        const { a, b } = makeOverlappingGlassShards();
        const tick = createKineticTestTick([a, b]);
        for (let step = 0; step < 8; step++) {
            resolveKineticContactPassWithEffects(tick);
            assert.equal(liveGlassCount(tick.world), 2, `reproduced on substep ${step}`);
        }
    });
    it("glass shard still shatters against a non-glass kinetic prop", () => {
        const shards = shatterGlassFootprint(24, 18, 0, 0, 40);
        const glass = new WorldProp(0, 0, "glass_pane", 0);
        const crate = new WorldProp(14, 0, "crate", 0);
        FractureEngine.applyPropFractureGeometry(glass, shards[0]);
        glass._fractureCooldown = 0;
        glass.vx = 120;
        crate.vx = -40;
        const tick = createKineticTestTick([glass, crate]);
        assert.ok(satCheckCollision(glass.x, glass.y, readEntityFacing(glass), glass.shape, crate.x, crate.y, readEntityFacing(crate), crate.shape));
        resolveKineticContactPassWithEffects(tick);
        assert.ok(liveGlassCount(tick.world) > 2);
        assert.ok(!tick.world.worldProps.includes(glass) || glass._fractureCooldown > 0);
    });
    it("runCollisionPipeline does not reproduce glass across persisted pair iterations", () => {
        const glass = new WorldProp(0, 0, "glass_pane", 0);
        const ball = new WorldProp(18, 0, "ball", 0);
        applyPropBoxFootprint(glass, 24, 18);
        glass.vx = 0;
        ball.vx = -200;
        assert.ok(satCheckCollision(glass.x, glass.y, readEntityFacing(glass), glass.shape, ball.x, ball.y, readEntityFacing(ball), ball.shape));
        const tick = createKineticTestTick([glass, ball]);
        runCollisionPipeline(tick, () => {}, (t, c) => t.world.fractureEngine.processKineticContactFractures(t, c));
        const count = liveGlassCount(tick.world);
        assert.ok(count > 2);
        assert.ok(count <= GLASS_MAX_SHARDS_PER_SHATTER + 2);
        assert.ok(!tick.world.worldProps.includes(glass) || glass._fractureCooldown > 0);
    });
    it("shattered glass shards conserve the total area of the parent shape without gaps", () => {
        const flat = new Float32Array([-16, -16, 16, -16, 16, 16, -16, 16]);
        const parentArea = 32 * 32; // 1024
        // Shatter at various points and verify the total area matches
        for (let i = 0; i < 5; i++) {
            const hitX = (Math.random() - 0.5) * 20;
            const hitY = (Math.random() - 0.5) * 20;
            const shards = shatterGlassPolygon(flat, hitX, hitY, 30);
            assert.ok(shards.length >= 2, "Should produce at least 2 shards");
            let totalArea = 0;
            for (const shard of shards) totalArea += shard.footprintArea;
            assert.ok(Math.abs(totalArea - parentArea) < 1e-3, `Expected total area close to ${parentArea}, got ${totalArea}`);
        }
    });
});
Math.random = originalMathRandom;
