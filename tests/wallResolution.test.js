import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { snapshotKineticBodySlab } from "../Libraries/Physics/physics.js";
import { applyPropBoxFootprint } from "../Libraries/Props/props.js";
import { satCheckCollision, entityFacing, SAT_RESULT } from "../Libraries/Physics/physics.js";
import { resolveBodyAgainstWallSegments, ensureWallSegmentPolygonShape } from "../Libraries/Physics/physics.js";
import { FractureEngine } from "../Libraries/Physics/fracture.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { runCollisionPipeline } from "../Libraries/Physics/physics.js";
import { WallCollisionResolver } from "../Libraries/Physics/physics.js";
import { dotXY } from "../Libraries/Math/math.js";
import { mockWallSegment } from "./harness/wallSegmentHarness.js";
function shapeOverlapsWall(prop, wall) {
    const segShape = ensureWallSegmentPolygonShape(wall);
    return satCheckCollision(prop.x, prop.y, entityFacing(prop), prop.shape, wall.x, wall.y, entityFacing(wall), segShape);
}
function resolveWallUntilClear(prop, segments, maxPasses = 6) {
    const wp = prop.strategy?.wallPhysics;
    for (let pass = 0; pass < maxPasses; pass++) {
        if (!shapeOverlapsWall(prop, segments[0])) return;
        resolveBodyAgainstWallSegments(prop, prop.shape, segments, { restitution: wp?.restitution ?? 0, friction: wp?.friction ?? 0.9 });
    }
}
function bar16x8(x, y) {
    const bar = new WorldProp(x, y, "custom_box", 0);
    applyPropBoxFootprint(bar, 8, 4);
    return bar;
}
describe("polygon wall resolution", () => {
    it("bar resting overlap pushes out with normal away from wall", () => {
        const bar = bar16x8(5, 0);
        bar.vx = 0;
        bar.vy = 0;
        const wall = mockWallSegment(-8, 0);
        assert.ok(shapeOverlapsWall(bar, wall));
        const wallBreakConfig = { minBreakStrength: 1, minStrikeSpeed: 28, referenceMaxSpeed: 560 };
        const { collided, hits } = resolveBodyAgainstWallSegments(bar, bar.shape, [wall], { restitution: bar.strategy.wallPhysics.restitution, friction: bar.strategy.wallPhysics.friction, wallBreakConfig });
        assert.ok(collided);
        assert.ok(hits.length > 0);
        assert.ok(hits[0].normalX > 0.9);
        assert.ok(Math.abs(hits[0].normalY) < 0.1);
        assert.ok(!shapeOverlapsWall(bar, wall));
    });
    it("tri wedge resolves against floor wall with upward normal", () => {
        const wedge = new WorldProp(0, 6, "tri_wedge", 0);
        wedge.vx = 0;
        wedge.vy = 0;
        const floor = mockWallSegment(0, 16);
        assert.ok(shapeOverlapsWall(wedge, floor));
        resolveWallUntilClear(wedge, [floor]);
        const collided = satCheckCollision(wedge.x, wedge.y, entityFacing(wedge), wedge.shape, floor.x, floor.y, entityFacing(floor), ensureWallSegmentPolygonShape(floor));
        if (collided) assert.ok(SAT_RESULT[2] < -0.5 || dotXY(SAT_RESULT[1], SAT_RESULT[2], 0, wedge.y - floor.y) > 0);
        assert.ok(!shapeOverlapsWall(wedge, floor));
    });
    it("wall impulse slows polygon sliding into a segment", () => {
        const bar = bar16x8(5, 0);
        bar.vx = -40;
        bar.vy = 0;
        const wall = mockWallSegment(-8, 0);
        resolveBodyAgainstWallSegments(bar, bar.shape, [wall], { restitution: bar.strategy.wallPhysics.restitution, friction: bar.strategy.wallPhysics.friction });
        assert.ok(bar.vx > -40);
    });
    it("collision pipeline resolves resting polygon at zero linear speed", () => {
        const bar = bar16x8(5, 0);
        bar.vx = 0;
        bar.vy = 0;
        bar._physId = 0;
        snapshotKineticBodySlab([bar]);
        const wall = mockWallSegment(-8, 0);
        assert.ok(shapeOverlapsWall(bar, wall));
        const resolver = new WallCollisionResolver();
        const frame = { frameId: 1, _kineticBodies: [bar], _activeKineticBodies: [bar], getWallCandidates: () => [wall], getNeighbors: () => [], flushScheduledKineticActivations() {} };
        const session = new KineticSession();
        const world = {
            worldProps: [bar],
            entityRegistry: { getLive: (id) => (id === bar.id ? bar : null) },
            kinetic: session,
        };
        runCollisionPipeline({ frame, world }, { resolveWalls: (entity) => resolver.resolve(entity, frame), kineticIterations: 1 });
        assert.ok(!shapeOverlapsWall(bar, wall));
    });
    it("wall hit wakes a sleeping polygon", () => {
        const bar = new WorldProp(5, 0, "hex_block", 0);
        bar.isSleeping = true;
        bar.vx = -50;
        const wall = mockWallSegment(-8, 0);
        const resolver = new WallCollisionResolver();
        resolver.resolve(bar, { frameId: 2, getWallCandidates: () => [wall] });
        assert.equal(bar.isSleeping, false);
    });
    it("breaking hit skips push-out when break strength passes threshold", () => {
        const bar = bar16x8(5, 0);
        bar.vx = -560;
        bar.vy = 0;
        const startX = bar.x;
        const wall = mockWallSegment(-8, 0);
        assert.ok(shapeOverlapsWall(bar, wall));
        const wallBreakConfig = { minBreakStrength: 0.1, minStrikeSpeed: 28, referenceMaxSpeed: 560 };
        const { collided, hits } = resolveBodyAgainstWallSegments(bar, bar.shape, [wall], {
            restitution: bar.strategy.wallPhysics.restitution,
            friction: bar.strategy.wallPhysics.friction,
            preSpeed: 560,
            wallBreakConfig,
        });
        assert.ok(collided);
        assert.ok(hits.length >= 1);
        assert.ok(Math.abs(bar.x - startX) < 0.01, "breaking hit should not push body out");
        assert.ok(bar.vx > -560, "breaking hit should apply bounce impulse to velocity");
        assert.ok(shapeOverlapsWall(bar, wall));
    });
    it("sub-threshold hit still pushes out overlapping body", () => {
        const bar = bar16x8(5, 0);
        bar.vx = -40;
        bar.vy = 0;
        const wall = mockWallSegment(-8, 0);
        assert.ok(shapeOverlapsWall(bar, wall));
        const wallBreakConfig = { minBreakStrength: 0.1, minStrikeSpeed: 28, referenceMaxSpeed: 560 };
        resolveBodyAgainstWallSegments(bar, bar.shape, [wall], {
            restitution: bar.strategy.wallPhysics.restitution,
            friction: bar.strategy.wallPhysics.friction,
            preSpeed: 40,
            wallBreakConfig,
        });
        assert.ok(!shapeOverlapsWall(bar, wall));
    });
});
