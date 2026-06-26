import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveKineticContactPass } from "./harness/kineticContactHarness.js";
import { createKineticTestTick, mockKineticCircle } from "./harness/kineticTickHarness.js";
import { withCollisionSettings } from "./harness/collisionSettingsHarness.js";

describe("kinetic contact warm-start", () => {
    it("resting contacts stop after one inner iteration", () => {
        withCollisionSettings({ kineticResting: { normalVelocityEpsilon: 0.05, tangentVelocityEpsilon: 0.05 } }, () => {
            const a = mockKineticCircle(0, 0, 10, 0.6, 0, { pairFriction: 0.8 });
            const b = mockKineticCircle(18, 0, 10, 0.55, 0, { pairFriction: 0.8 });
            const tick = createKineticTestTick([a, b]);
            resolveKineticContactPass(tick);
            const stats = tick.world.kinetic.kineticContactStats;
            assert.ok(stats.restingCount > 0);
            assert.equal(stats.innerIterations, 1);
        });
    });

    it("warm-started second frame keeps feature-id cache for slow overlap", () => {
        withCollisionSettings({ kineticWarmStartDecay: 1, kineticResting: { normalVelocityEpsilon: 0.05, tangentVelocityEpsilon: 0.05 } }, () => {
            const a = mockKineticCircle(0, 0, 10, 0.6, 0, { pairFriction: 0.8 });
            const b = mockKineticCircle(18, 0, 10, 0.55, 0, { pairFriction: 0.8 });
            const tick = createKineticTestTick([a, b]);
            resolveKineticContactPass(tick);
            assert.ok(tick.world.kinetic.kineticContactStats.maxImpulse > 0.05);
            resolveKineticContactPass(tick);
            const stats = tick.world.kinetic.kineticContactStats;
            assert.ok(stats.restingCount > 0);
            assert.equal(stats.innerIterations, 1);
        });
    });
});
