import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countMotionSubsteps } from "../Libraries/Physics/physics.js";
import { runKineticPhysics } from "../Libraries/Physics/physics.js";
import { createKineticTestTick, kineticPhysicsHooks, mockKineticCircle } from "./harness/kineticTickHarness.js";
import { withCollisionSettings } from "./harness/collisionSettingsHarness.js";
import { kineticStaticSlab, primitivePhysics } from "../Core/engineMemory.js";

describe("kinetic substep early-out", () => {
    it("skips remaining substeps once bodies fall below velocity epsilon", () => {
        withCollisionSettings({ motionSubsteps: { maxStepPx: 4, maxSubsteps: 8 }, kineticEarlyOut: { velocityEpsilonSq: 0.04 } }, () => {
            const body = mockKineticCircle(0, 0, 10, 120, 0, { currentState: true, needsWallCollision: false });
            const dt = 100;
            const tick = createKineticTestTick([body]);
            const planned = countMotionSubsteps(dt, { maxStepPx: 4, maxSubsteps: 8 });
            assert.ok(planned > 1);
            const row = kineticStaticSlab.physicsRow[body._physId];
            const prevDrag = primitivePhysics.dragFriction[row];
            primitivePhysics.dragFriction[row] = 80;
            try {
                runKineticPhysics(tick, dt, kineticPhysicsHooks());
            } finally {
                primitivePhysics.dragFriction[row] = prevDrag;
            }
            assert.ok(tick.world.kinetic.motionSubstepStats.substepsRun < tick.world.kinetic.motionSubstepStats.substepsPlanned);
        });
    });
});
