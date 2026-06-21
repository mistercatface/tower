import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyGameCollisionSettings } from "../Core/GameCollisionSettings.js";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { runCollisionPipeline } from "../Libraries/Spatial/collision/collisionPipeline.js";
import { persistedKineticPairBuffer } from "../Libraries/Spatial/collision/kineticPairStream.js";
import { activeBodiesMatchKineticSlab } from "../Libraries/Spatial/collision/kineticBodySlab.js";
import { snapshotActiveBroadphaseBounds } from "../Libraries/Spatial/collision/entityBroadphase.js";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { SatCollision } from "../Libraries/Spatial/collision/SatCollision.js";
import { setCirclePropRadius } from "../Libraries/Props/propScale.js";
import { addDistanceConstraint, resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { runKineticPhysics } from "../Libraries/Motion/kineticPhysicsPass.js";
import { createKineticTestTick } from "./harness/kineticTickHarness.js";

loadPropAssets();

let nextId = 1;

function mockCircleBody(x, y, radius, vx = 0, vy = 0) {
    return {
        id: nextId++,
        x,
        y,
        radius,
        vx,
        vy,
        angularVelocity: 0,
        isSleeping: false,
        strategy: { isKinetic: true },
        mass: radius,
        get momentOfInertia() {
            return this.mass * this.radius * this.radius * 0.5;
        },
        getShape() {
            return new CircleShape(this.radius);
        },
        needsWallCollision() {
            return false;
        },
    };
}

describe("kinetic pair persistence", () => {
    it("reuses gathered pair list across outer iterations", () => {
        applyGameCollisionSettings({
            collisionSettings: {
                kineticIterations: 3,
                kineticEarlyOut: { velocityEpsilonSq: -1, constraintErrorEpsilon: -1, contactImpulseEpsilon: -1 },
            },
        });
        const a = mockCircleBody(0, 0, 10, 50, 0);
        const b = mockCircleBody(14, 0, 10, -40, 0);
        const tick = createKineticTestTick([a, b]);
        const ax0 = a.x;
        runCollisionPipeline(tick, { resolveWalls: () => {} });
        assert.equal(tick.world.kinetic.kineticSolverStats.outerIterations, 3);
        assert.equal(persistedKineticPairBuffer.count, 1);
        assert.ok(a.x !== ax0 || b.x !== 14);
        applyGameCollisionSettings(null);
    });

    it("syncs body slab before early-out when props moved after constraints", () => {
        applyGameCollisionSettings({
            collisionSettings: {
                kineticIterations: 4,
                kineticEarlyOut: { velocityEpsilonSq: 0.04, constraintErrorEpsilon: 1e-3, contactImpulseEpsilon: 1e-4 },
            },
        });
        resetKineticConstraintIds(1);
        const bodyA = mockCircleBody(0, 0, 10);
        const bodyB = mockCircleBody(20, 0, 10);
        const tick = createKineticTestTick([bodyA, bodyB]);
        addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 20 });
        runCollisionPipeline(tick, { resolveWalls: () => {} });
        snapshotActiveBroadphaseBounds(tick.frame._activeKineticBodies);
        assert.ok(activeBodiesMatchKineticSlab(tick.frame._activeKineticBodies));
        assert.ok(tick.world.kinetic.kineticSolverStats.outerIterations <= tick.world.kinetic.kineticSolverStats.maxIterations);
        applyGameCollisionSettings(null);
    });

    it("warm-starts mixed circle-poly contact across consecutive pipeline passes", () => {
        applyGameCollisionSettings({
            collisionSettings: {
                kineticIterations: 2,
                kineticEarlyOut: { velocityEpsilonSq: -1, constraintErrorEpsilon: -1, contactImpulseEpsilon: -1 },
            },
        });
        const ball = new WorldProp(0, 0, "ball", 0);
        setCirclePropRadius(ball, 7);
        const wedge = new WorldProp(10, 0, "tri_wedge", 0);
        wedge.vx = -25;
        assert.ok(SatCollision.checkCollision(ball, ball.getShape(), wedge, wedge.getShape()));
        const tick = createKineticTestTick([ball, wedge]);
        runCollisionPipeline(tick, { resolveWalls: () => {} });
        wedge.vx = -25;
        runCollisionPipeline(tick, { resolveWalls: () => {} });
        assert.ok(!SatCollision.checkCollision(ball, ball.getShape(), wedge, wedge.getShape()));
        applyGameCollisionSettings(null);
    });

    it("refreshes persisted pairs across motion substeps instead of regathering", () => {
        applyGameCollisionSettings({
            collisionSettings: {
                motionSubsteps: { maxStepPx: 4, maxSubsteps: 4 },
                kineticIterations: 2,
                kineticEarlyOut: { velocityEpsilonSq: -1, constraintErrorEpsilon: -1, contactImpulseEpsilon: -1 },
            },
        });
        const a = mockCircleBody(0, 0, 10, 80, 0);
        const b = mockCircleBody(14, 0, 10, -60, 0);
        a.update = (dt) => {
            a.x += a.vx * (dt / 1000);
        };
        b.update = (dt) => {
            b.x += b.vx * (dt / 1000);
        };
        const tick = createKineticTestTick([a, b]);
        runKineticPhysics(tick, 100, {
            updateProp: (prop, subDt) => prop.update?.(subDt),
            resolveWalls: () => {},
            applyContactSideEffects: () => {},
        });
        const stats = tick.world.kinetic.kineticPairGatherStats;
        const substeps = tick.world.kinetic.motionSubstepStats.substepsRun;
        assert.equal(stats.full, 1);
        assert.ok(substeps > 1);
        assert.equal(stats.refresh, substeps - 1);
        assert.equal(persistedKineticPairBuffer.count, 1);
        applyGameCollisionSettings(null);
    });
});
