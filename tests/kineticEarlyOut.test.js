import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDistanceConstraint } from "../Libraries/Physics/physics.js";
import { runCollisionPipeline } from "../Libraries/Physics/physics.js";
import { createKineticTestTick, noop, mockKineticCircle } from "./harness/kineticTickHarness.js";
import { withCollisionSettings } from "./harness/collisionSettingsHarness.js";

describe("kinetic early-out", () => {
    it("stops outer iterations early on settled constraint chain", () => {
        withCollisionSettings({ kineticIterations: 4, kineticEarlyOut: { velocityEpsilonSq: 0.04, constraintErrorEpsilon: 1e-3 } }, () => {
            const bodyA = mockKineticCircle(0, 0, 10, 0, 0);
            const bodyB = mockKineticCircle(20, 0, 10, 0, 0);
            const tick = createKineticTestTick([bodyA, bodyB], { constraintsDirty: true });
            addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 20 });
            runCollisionPipeline(tick, noop, noop);
            assert.ok(tick.world.kinetic.kineticSolverStats.outerIterations < tick.world.kinetic.kineticSolverStats.maxIterations);
        });
    });
});
