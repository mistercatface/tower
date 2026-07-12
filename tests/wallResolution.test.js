import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp, applyPropBoxFootprint } from "../Libraries/Props/props.js";
import { satCheckPolygonVsWallSegment, readEntityFacing, SAT_RESULT, resolveBodyAgainstWallSegments, createWallHitBuffer, runCollisionPipeline, WallCollisionResolver, createKineticSession, snapshotKineticBodySlab, clearActiveKineticBodySlab, appendActiveKineticBodySlabPhysId } from "../Libraries/Physics/physics.js";
import { computeWallBreakStrength } from "../Libraries/Physics/fracture.js";
import { dotXY } from "../Libraries/Math/math.js";
import { staticWallSegmentSlab, kineticStaticSlab } from "../Core/engineMemory.js";
import { mockWallSegment, wallSegIds } from "./harness/wallSegmentHarness.js";
import { assignPhysIdWithPose } from "./harness/kineticTickHarness.js";
function shapeOverlapsWall(prop, segId) {
    return satCheckPolygonVsWallSegment(prop.x, prop.y, readEntityFacing(prop), prop.shape, segId);
}
function wallRestitution(prop) {
    return kineticStaticSlab.restitution[prop._physId];
}
function wallFriction(prop) {
    return kineticStaticSlab.friction[prop._physId];
}
function resolveWallUntilClear(prop, segIds, maxPasses = 6) {
    for (let pass = 0; pass < maxPasses; pass++) {
        if (!shapeOverlapsWall(prop, segIds.buf[0])) return;
        resolveBodyAgainstWallSegments(prop, prop.shape, segIds, wallRestitution(prop), wallFriction(prop));
    }
}
function bar16x8(x, y, physId) {
    const bar = new WorldProp(x, y, "box", 0);
    applyPropBoxFootprint(bar, 8, 4);
    assignPhysIdWithPose(bar, physId);
    snapshotKineticBodySlab([bar._physId], 1);
    return bar;
}
describe("polygon wall resolution", () => {
    it("bar resting overlap pushes out with normal away from wall", () => {
        const bar = bar16x8(5, 0, 0);
        bar.vx = 0;
        bar.vy = 0;
        const wall = mockWallSegment(-8, 0);
        const segs = wallSegIds(wall);
        assert.ok(shapeOverlapsWall(bar, wall));
        const hits = createWallHitBuffer();
        const collided = resolveBodyAgainstWallSegments(bar, bar.shape, segs, wallRestitution(bar), wallFriction(bar), () => false, hits);
        assert.ok(collided);
        assert.ok(hits.count > 0);
        assert.ok(hits.normalX[0] > 0.9);
        assert.ok(Math.abs(hits.normalY[0]) < 0.1);
        assert.ok(!shapeOverlapsWall(bar, wall));
    });
    it("tri wedge resolves against floor wall with upward normal", () => {
        const wedge = new WorldProp(0, 6, "tri_wedge", 0);
        assignPhysIdWithPose(wedge, 1);
        snapshotKineticBodySlab([wedge._physId], 1);
        wedge.vx = 0;
        wedge.vy = 0;
        const floor = mockWallSegment(0, 16);
        const segs = wallSegIds(floor);
        assert.ok(shapeOverlapsWall(wedge, floor));
        resolveWallUntilClear(wedge, segs);
        const slab = staticWallSegmentSlab;
        const collided = satCheckPolygonVsWallSegment(wedge.x, wedge.y, readEntityFacing(wedge), wedge.shape, floor);
        if (collided) assert.ok(SAT_RESULT[2] < -0.5 || dotXY(SAT_RESULT[1], SAT_RESULT[2], 0, wedge.y - slab.y[floor]) > 0);
        assert.ok(!shapeOverlapsWall(wedge, floor));
    });
    it("wall impulse slows polygon sliding into a segment", () => {
        const bar = bar16x8(5, 0, 2);
        bar.vx = -40;
        bar.vy = 0;
        const wall = mockWallSegment(-8, 0);
        resolveBodyAgainstWallSegments(bar, bar.shape, wallSegIds(wall), wallRestitution(bar), wallFriction(bar));
        assert.ok(bar.vx > -40);
    });
    it("collision pipeline resolves resting polygon at zero linear speed", () => {
        const bar = bar16x8(5, 0, 0);
        bar.vx = 0;
        bar.vy = 0;
        snapshotKineticBodySlab([bar._physId], 1);
        const wall = mockWallSegment(-8, 0);
        const segs = wallSegIds(wall);
        assert.ok(shapeOverlapsWall(bar, wall));
        const resolver = new WallCollisionResolver();
        const frame = {
            frameId: 1,
            kineticEids: Int32Array.of(bar._physId),
            kineticEidCount: 1,
            getWallCandidates: () => segs,
            ensureNeighborEids: () => 0,
            flushScheduledKineticActivations() {},
            syncActiveKineticBodies() {},
        };
        clearActiveKineticBodySlab();
        appendActiveKineticBodySlabPhysId(bar._physId);
        const session = createKineticSession();
        const world = {
            worldProps: [bar],
            entityRegistry: { getLive: (id) => (id === bar.id ? bar : null) },
            kinetic: session,
        };
        runCollisionPipeline({ frame, world }, (entity) => resolver.resolve(entity, frame), undefined, 1);
        assert.ok(!shapeOverlapsWall(bar, wall));
    });
    it("wall hit wakes a sleeping polygon", () => {
        const bar = new WorldProp(5, 0, "hex_block", 0);
        assignPhysIdWithPose(bar, 3);
        snapshotKineticBodySlab([bar._physId], 1);
        bar.isSleeping = true;
        bar.vx = -50;
        const wall = mockWallSegment(-8, 0);
        const resolver = new WallCollisionResolver();
        resolver.resolve(bar, { frameId: 2, getWallCandidates: () => wallSegIds(wall) });
        assert.equal(bar.isSleeping, false);
    });
    it("breaking hit skips push-out when break strength passes threshold", () => {
        const bar = bar16x8(5, 0, 4);
        bar.vx = -560;
        bar.vy = 0;
        const startX = bar.x;
        const wall = mockWallSegment(-8, 0);
        assert.ok(shapeOverlapsWall(bar, wall));
        const wallBreakConfig = { minBreakStrength: 0.1, minStrikeSpeed: 28, referenceMaxSpeed: 560 };
        const hits = createWallHitBuffer();
        const collided = resolveBodyAgainstWallSegments(
            bar,
            bar.shape,
            wallSegIds(wall),
            wallRestitution(bar),
            wallFriction(bar),
            (approachDot) => computeWallBreakStrength(560, approachDot, wallBreakConfig) >= wallBreakConfig.minBreakStrength,
            hits,
        );
        assert.ok(collided);
        assert.ok(hits.count >= 1);
        assert.ok(Math.abs(bar.x - startX) < 0.01, "breaking hit should not push body out");
        assert.ok(bar.vx > -560, "breaking hit should apply bounce impulse to velocity");
        assert.ok(shapeOverlapsWall(bar, wall));
    });
    it("sub-threshold hit still pushes out overlapping body", () => {
        const bar = bar16x8(5, 0, 5);
        bar.vx = -40;
        bar.vy = 0;
        const wall = mockWallSegment(-8, 0);
        assert.ok(shapeOverlapsWall(bar, wall));
        const wallBreakConfig = { minBreakStrength: 0.1, minStrikeSpeed: 28, referenceMaxSpeed: 560 };
        resolveBodyAgainstWallSegments(
            bar,
            bar.shape,
            wallSegIds(wall),
            wallRestitution(bar),
            wallFriction(bar),
            (approachDot) => computeWallBreakStrength(40, approachDot, wallBreakConfig) >= wallBreakConfig.minBreakStrength,
        );
        assert.ok(!shapeOverlapsWall(bar, wall));
    });
});
