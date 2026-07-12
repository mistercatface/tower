import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countMotionSubsteps } from "../Libraries/Physics/physics.js";
import { runKineticPhysics } from "../Libraries/Physics/physics.js";
import { createKineticTestTick, kineticIntegrateHooks, mockKineticCircle } from "./harness/kineticTickHarness.js";
import { withCollisionSettings } from "./harness/collisionSettingsHarness.js";

describe("kinetic substep early-out", () => {
    it("skips remaining substeps once bodies fall below velocity epsilon", () => {
        withCollisionSettings({ motionSubsteps: { maxStepPx: 4, maxSubsteps: 8 }, kineticEarlyOut: { velocityEpsilonSq: 0.04 } }, () => {
            const body = mockKineticCircle(0, 0, 10, 120, 0, { currentState: true, dampedMotion: true, needsWallCollision: false });
            const dt = 100;
            const tick = createKineticTestTick([body]);
            const planned = countMotionSubsteps(dt, { maxStepPx: 4, maxSubsteps: 8 });
            assert.ok(planned > 1);
            runKineticPhysics(tick, dt, kineticIntegrateHooks((prop, subDt) => prop.update(subDt)));
            assert.ok(tick.world.kinetic.motionSubstepStats.substepsRun < tick.world.kinetic.motionSubstepStats.substepsPlanned);
        });
    });
});
