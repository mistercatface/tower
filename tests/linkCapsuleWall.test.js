import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createKineticTestTick, mockKineticCircle, kineticPhysicsHooks, noop } from "./harness/kineticTickHarness.js";
import { addDistanceConstraint, runKineticPhysics, runCollisionPipeline, getLinkCapsuleSegmentPenetration, minDistanceSegmentToWall } from "../Libraries/Physics/physics.js";
import { P_OUT_PEN_OVERLAP } from "../Core/engineMemory.js";
import { kineticDynamicSlab, ENGINE_F32 } from "../Core/engineMemory.js";
import { mockWallSegment, wallSegIds } from "./harness/wallSegmentHarness.js";

const wallCircle = (x, y, radius, vx = 0, vy = 0) => mockKineticCircle(x, y, radius, vx, vy);

describe("link capsule wall projection", () => {
    it("detects link penetration when endpoint circles straddle a rail gap", () => {
        const wall = mockWallSegment(58, 8, 16);
        const ax = 50;
        const ay = 10;
        const bx = 66;
        const by = 14;
        const radius = 4;
        assert.ok(minDistanceSegmentToWall(ax, ay, bx, by, wall) < radius);
        const isPenetrating = getLinkCapsuleSegmentPenetration(ax, ay, bx, by, radius, wall);
        assert.ok(isPenetrating);
        assert.ok(ENGINE_F32[P_OUT_PEN_OVERLAP] > 0);
    });
    it("projects a wedged distance link out of a wall segment", () => {
        const wall = mockWallSegment(58, 4, 16);
        const bodyA = wallCircle(50, 14, 4);
        const bodyB = wallCircle(66, 14, 4);
        const tick = createKineticTestTick([bodyA, bodyB]);
        addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 16 });
        tick.frame.getWallCandidates = () => wallSegIds(wall);
        assert.ok(minDistanceSegmentToWall(bodyA.x, bodyA.y, bodyB.x, bodyB.y, wall) < 4);
        runCollisionPipeline(tick, noop, noop);
        assert.ok(minDistanceSegmentToWall(bodyA.x, bodyA.y, bodyB.x, bodyB.y, wall) >= 4 - 0.05);
    });
    it("does not disturb a fast-moving link in open space with distant gathered walls", () => {
        const bodyA = wallCircle(10, 10, 4, 40, 0);
        const bodyB = wallCircle(26, 10, 4, 40, 0);
        const startAx = bodyA.x;
        const startBx = bodyB.x;
        const tick = createKineticTestTick([bodyA, bodyB]);
        addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 16 });
        const decoyWalls = wallSegIds(...Array.from({ length: 32 }, (_, i) => mockWallSegment(400 + i * 8, 400, 16)));
        tick.frame.getWallCandidates = () => decoyWalls;
        runCollisionPipeline(tick, noop, noop);
        assert.equal(bodyA.x, startAx);
        assert.equal(bodyB.x, startBx);
    });
    it("filters island walls per link before narrow phase", () => {
        const nearWall = mockWallSegment(58, 4, 16);
        const farWall = mockWallSegment(500, 500, 16);
        const bodyA = wallCircle(50, 14, 4, 0, 0);
        const bodyB = wallCircle(66, 14, 4, 0, 0);
        const tick = createKineticTestTick([bodyA, bodyB]);
        addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 16 });
        tick.frame.getWallCandidates = () => wallSegIds(nearWall, farWall);
        assert.ok(minDistanceSegmentToWall(bodyA.x, bodyA.y, bodyB.x, bodyB.y, nearWall) < 4);
        runCollisionPipeline(tick, noop, noop);
        assert.ok(minDistanceSegmentToWall(bodyA.x, bodyA.y, bodyB.x, bodyB.y, nearWall) >= 4 - 0.05);
    });
    it("still projects a nearly-static wedged link", () => {
        const wall = mockWallSegment(58, 4, 16);
        const bodyA = wallCircle(50, 14, 4, 0, 0);
        const bodyB = wallCircle(66, 14, 4, 0, 0);
        const tick = createKineticTestTick([bodyA, bodyB]);
        addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 16 });
        tick.frame.getWallCandidates = () => wallSegIds(wall);
        runCollisionPipeline(tick, noop, noop);
        assert.ok(minDistanceSegmentToWall(bodyA.x, bodyA.y, bodyB.x, bodyB.y, wall) >= 4 - 0.05);
    });
    it("link wall correction survives constraint solve on kinetic slab", () => {
        const wall = mockWallSegment(58, 4, 16);
        const bodyA = wallCircle(50, 14, 4);
        const bodyB = wallCircle(66, 14, 4);
        const tick = createKineticTestTick([bodyA, bodyB]);
        addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 16 });
        tick.frame.getWallCandidates = () => wallSegIds(wall);
        assert.ok(minDistanceSegmentToWall(bodyA.x, bodyA.y, bodyB.x, bodyB.y, wall) < 4);
        runKineticPhysics(tick, 16.667, kineticPhysicsHooks());
        const slabAx = kineticDynamicSlab.x[bodyA._physId];
        const slabAy = kineticDynamicSlab.y[bodyA._physId];
        const slabBx = kineticDynamicSlab.x[bodyB._physId];
        const slabBy = kineticDynamicSlab.y[bodyB._physId];
        assert.ok(minDistanceSegmentToWall(slabAx, slabAy, slabBx, slabBy, wall) >= 4 - 0.05);
    });
});
