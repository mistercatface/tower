import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runCollisionPipeline } from "../Libraries/Spatial/collision/collisionPipeline.js";
import { persistedKineticPairBuffer } from "../Libraries/Spatial/collision/kineticPairStream.js";
import { activeBodiesMatchKineticSlab, kineticDynamicSlab } from "../Libraries/Spatial/collision/kineticBodySlab.js";
import { snapshotActiveBroadphaseBounds } from "../Libraries/Spatial/collision/entityBroadphase.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { SatCollision, checkEntityPairCollisionAt, entityFacing } from "../Libraries/Spatial/collision/SatCollision.js";
import { setCirclePropRadius } from "../Libraries/Props/propScale.js";
import { addDistanceConstraint, resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { runKineticPhysics } from "../Libraries/Motion/kineticPhysicsPass.js";
import { createKineticTestTick, kineticPipelineStubs, mockKineticCircle } from "./harness/kineticTickHarness.js";
import { collisionSettingsForIterations, withCollisionSettings } from "./harness/collisionSettingsHarness.js";

function slabPairCollision(a, b) {
    return checkEntityPairCollisionAt(a, kineticDynamicSlab.x[a._physId], kineticDynamicSlab.y[a._physId], b, kineticDynamicSlab.x[b._physId], kineticDynamicSlab.y[b._physId]);
}

describe("kinetic pair persistence", () => {
    it("reuses gathered pair list across outer iterations", () => {
        withCollisionSettings(collisionSettingsForIterations(3), () => {
            const a = mockKineticCircle(0, 0, 10, 50, 0, { currentState: true, needsWallCollision: false });
            const b = mockKineticCircle(14, 0, 10, -40, 0, { currentState: true, needsWallCollision: false });
            const tick = createKineticTestTick([a, b]);
            const ax0 = a.x;
            runCollisionPipeline(tick, kineticPipelineStubs);
            assert.equal(tick.world.kinetic.kineticSolverStats.outerIterations, 3);
            assert.equal(persistedKineticPairBuffer.count, 1);
            assert.ok(a.x !== ax0 || b.x !== 14);
            assert.ok(activeBodiesMatchKineticSlab(tick.frame._activeKineticBodies));
        });
    });

    it("syncs body slab before early-out when props moved after constraints", () => {
        withCollisionSettings({ kineticIterations: 4, kineticEarlyOut: { velocityEpsilonSq: 0.04, constraintErrorEpsilon: 1e-3, contactImpulseEpsilon: 1e-4 } }, () => {
            resetKineticConstraintIds(1);
            const bodyA = mockKineticCircle(0, 0, 10, 0, 0, { needsWallCollision: false });
            const bodyB = mockKineticCircle(20, 0, 10, 0, 0, { needsWallCollision: false });
            const tick = createKineticTestTick([bodyA, bodyB]);
            addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 20 });
            runCollisionPipeline(tick, kineticPipelineStubs);
            snapshotActiveBroadphaseBounds(tick.frame._activeKineticBodies);
            assert.ok(activeBodiesMatchKineticSlab(tick.frame._activeKineticBodies));
            assert.ok(tick.world.kinetic.kineticSolverStats.outerIterations <= tick.world.kinetic.kineticSolverStats.maxIterations);
        });
    });

    it("warm-starts mixed circle-poly contact across consecutive pipeline passes", () => {
        withCollisionSettings(collisionSettingsForIterations(2), () => {
            const ball = new WorldProp(0, 0, "ball", 0);
            setCirclePropRadius(ball, 7);
            const wedge = new WorldProp(10, 0, "tri_wedge", 0);
            wedge.vx = -25;
            assert.ok(SatCollision.checkCollision(ball.x, ball.y, entityFacing(ball), ball.getShape(), wedge.x, wedge.y, entityFacing(wedge), wedge.getShape()));
            const tick = createKineticTestTick([ball, wedge]);
            runCollisionPipeline(tick, kineticPipelineStubs);
            wedge.vx = -25;
            runCollisionPipeline(tick, kineticPipelineStubs);
            assert.ok(!slabPairCollision(ball, wedge));
        });
    });

    it("refreshes persisted pairs across motion substeps instead of regathering", () => {
        withCollisionSettings({
            motionSubsteps: { maxStepPx: 4, maxSubsteps: 4 },
            ...collisionSettingsForIterations(2),
        }, () => {
            const a = mockKineticCircle(0, 0, 10, 80, 0, { currentState: true, needsWallCollision: false });
            const b = mockKineticCircle(14, 0, 10, -60, 0, { currentState: true, needsWallCollision: false });
            a.update = (dt) => {
                a.x += a.vx * (dt / 1000);
            };
            b.update = (dt) => {
                b.x += b.vx * (dt / 1000);
            };
            const tick = createKineticTestTick([a, b]);
            runKineticPhysics(tick, 100, {
                updateProp: (prop, subDt) => prop.update?.(subDt),
                ...kineticPipelineStubs,
            });
            const stats = tick.world.kinetic.kineticPairGatherStats;
            const substeps = tick.world.kinetic.motionSubstepStats.substepsRun;
            assert.equal(stats.full, 1);
            assert.ok(substeps > 1);
            assert.equal(stats.refresh, substeps - 1);
            assert.equal(persistedKineticPairBuffer.count, 1);
        });
    });
});
