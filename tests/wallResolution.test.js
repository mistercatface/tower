import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Entities/WorldProp.js";
import { writeActiveKineticBodySlabPose, writeStaticKineticSlabSlot, writeBroadphaseFromBounds } from "../Libraries/Spatial/collision/kineticBodySlab.js";
import { applyPropBoxFootprint } from "../Libraries/Props/propStrategy.js";
import { SatCollision, entityFacing, SAT_RESULT } from "../Libraries/Spatial/collision/SatCollision.js";
import { resolveBodyAgainstWallSegments, ensureWallSegmentPolygonShape } from "../Libraries/Spatial/collision/wallResolution.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { createKineticTick } from "../GameState/KineticTick.js";
import { runCollisionPipeline } from "../Libraries/Spatial/collision/collisionPipeline.js";
import { WallCollisionResolver } from "../Libraries/Motion/WallCollisionResolver.js";
import { dotXY } from "../Libraries/Math/Vec2.js";
function mockWallSegment(x, y, size = 16) {
    return { x, y, size, width: size, height: size, angle: 0, isDead: false };
}
function shapeOverlapsWall(prop, wall) {
    const segShape = ensureWallSegmentPolygonShape(wall);
    return SatCollision.checkCollision(prop.x, prop.y, entityFacing(prop), prop.getShape(), wall.x, wall.y, entityFacing(wall), segShape);
}
function resolveWallUntilClear(prop, segments, maxPasses = 6) {
    const wp = prop.strategy?.wallPhysics;
    for (let pass = 0; pass < maxPasses; pass++) {
        if (!shapeOverlapsWall(prop, segments[0])) return;
        resolveBodyAgainstWallSegments(prop, prop.getShape(), segments, { restitution: wp?.restitution ?? 0, friction: wp?.friction ?? 0.9 });
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
        const { collided, hits } = resolveBodyAgainstWallSegments(bar, bar.getShape(), [wall], { restitution: bar.strategy.wallPhysics.restitution, friction: bar.strategy.wallPhysics.friction });
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
        const collided = SatCollision.checkCollision(wedge.x, wedge.y, entityFacing(wedge), wedge.getShape(), floor.x, floor.y, entityFacing(floor), ensureWallSegmentPolygonShape(floor));
        if (collided) assert.ok(SAT_RESULT[2] < -0.5 || dotXY(SAT_RESULT[1], SAT_RESULT[2], 0, wedge.y - floor.y) > 0);
        assert.ok(!shapeOverlapsWall(wedge, floor));
    });
    it("wall impulse slows polygon sliding into a segment", () => {
        const bar = bar16x8(5, 0);
        bar.vx = -40;
        bar.vy = 0;
        const wall = mockWallSegment(-8, 0);
        resolveBodyAgainstWallSegments(bar, bar.getShape(), [wall], { restitution: bar.strategy.wallPhysics.restitution, friction: bar.strategy.wallPhysics.friction });
        assert.ok(bar.vx > -40);
    });
    it("collision pipeline resolves resting polygon at zero linear speed", () => {
        const bar = bar16x8(5, 0);
        bar.vx = 0;
        bar.vy = 0;
        bar._physId = 0;
        writeActiveKineticBodySlabPose(bar);
        writeStaticKineticSlabSlot(bar);
        writeBroadphaseFromBounds(bar._physId, bar.getShape());
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
        runCollisionPipeline(createKineticTick(frame, world), { resolveWalls: (entity) => resolver.resolve(entity, frame), kineticIterations: 1 });
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
});
