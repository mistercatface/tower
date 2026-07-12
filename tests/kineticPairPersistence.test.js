import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runCollisionPipeline } from "../Libraries/Physics/physics.js";
import { snapshotKineticBodySlab } from "../Libraries/Physics/physics.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { readEntityFacing } from "../Libraries/Physics/physics.js";
import { satCheckCollision } from "./harness/satCollisionHarness.js";
import { setCirclePropRadius } from "../Libraries/Props/props.js";
import { addDistanceConstraint } from "../Libraries/Physics/physics.js";
import { runKineticPhysics } from "../Libraries/Physics/physics.js";
import { createKineticTestTick, kineticIntegrateHooks, noop, mockKineticCircle } from "./harness/kineticTickHarness.js";
import { collisionSettingsForIterations, withCollisionSettings } from "./harness/collisionSettingsHarness.js";
import { kineticDynamicSlab } from "../Core/engineMemory.js";
import { bodiesMatchKineticSlab } from "./harness/kineticSlabHarness.js";
import { checkPairAtSlabPose } from "./harness/kineticContactHarness.js";

function slabPairCollision(a, b) {
    return checkPairAtSlabPose(a, b);
}

describe("kinetic pair persistence", () => {
    it("reuses gathered pair list across outer iterations", () => {
        withCollisionSettings(collisionSettingsForIterations(3), () => {
            const a = mockKineticCircle(0, 0, 10, 50, 0, { currentState: true, needsWallCollision: false });
            const b = mockKineticCircle(14, 0, 10, -40, 0, { currentState: true, needsWallCollision: false });
            const tick = createKineticTestTick([a, b]);
            const ax0 = a.x;
            runCollisionPipeline(tick, noop, noop);
            assert.equal(tick.world.kinetic.kineticSolverStats.outerIterations, 3);
            assert.equal(tick.world.kinetic.kineticSolverStats.pairCount, 1);
            assert.ok(a.x !== ax0 || b.x !== 14);
            assert.ok(bodiesMatchKineticSlab([a, b]));
        });
    });

    it("syncs body slab before early-out when props moved after constraints", () => {
        withCollisionSettings({ kineticIterations: 4, kineticEarlyOut: { velocityEpsilonSq: 0.04, constraintErrorEpsilon: 1e-3, contactImpulseEpsilon: 1e-4 } }, () => {
            const bodyA = mockKineticCircle(0, 0, 10, 0, 0, { needsWallCollision: false });
            const bodyB = mockKineticCircle(20, 0, 10, 0, 0, { needsWallCollision: false });
            const tick = createKineticTestTick([bodyA, bodyB]);
            addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 20 });
            runCollisionPipeline(tick, noop, noop);
            snapshotKineticBodySlab(kineticDynamicSlab.activePhysIds, kineticDynamicSlab.activePhysCount);
            assert.ok(bodiesMatchKineticSlab([bodyA, bodyB]));
            assert.ok(tick.world.kinetic.kineticSolverStats.outerIterations <= tick.world.kinetic.kineticSolverStats.maxIterations);
        });
    });

    it("warm-starts mixed circle-poly contact across consecutive pipeline passes", () => {
        withCollisionSettings(collisionSettingsForIterations(2), () => {
            const ball = new WorldProp(0, 0, "ball", 0);
            setCirclePropRadius(ball, 7);
            const wedge = new WorldProp(10, 0, "tri_wedge", 0);
            wedge.vx = -25;
            assert.ok(satCheckCollision(ball.x, ball.y, readEntityFacing(ball), ball.shape, wedge.x, wedge.y, readEntityFacing(wedge), wedge.shape));
            const tick = createKineticTestTick([ball, wedge]);
            runCollisionPipeline(tick, noop, noop);
            wedge.vx = -25;
            runCollisionPipeline(tick, noop, noop);
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
            runKineticPhysics(tick, 100, kineticIntegrateHooks((prop, subDt) => prop.update?.(subDt)));
            const stats = tick.world.kinetic.kineticPairGatherStats;
            const substeps = tick.world.kinetic.motionSubstepStats.substepsRun;
            assert.equal(stats.full, 1);
            assert.ok(substeps > 1);
            assert.equal(stats.refresh, substeps - 1);
            assert.equal(tick.world.kinetic.kineticSolverStats.pairCount, 1);
        });
    });
});
