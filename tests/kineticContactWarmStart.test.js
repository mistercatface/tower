import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyGameCollisionSettings } from "../Core/GameCollisionSettings.js";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { resolveKineticContactPass } from "./harness/kineticContactHarness.js";
import { createKineticTestTick } from "./harness/kineticTickHarness.js";

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
        strategy: { isKinetic: true, pairFriction: 0.8 },
        mass: radius,
        get momentOfInertia() {
            return this.mass * this.radius * this.radius * 0.5;
        },
        getShape() {
            return new CircleShape(this.radius);
        },
    };
}

describe("kinetic contact warm-start", () => {
    it("resting contacts stop after one inner iteration", () => {
        applyGameCollisionSettings({
            collisionSettings: {
                kineticResting: { normalVelocityEpsilon: 0.05, tangentVelocityEpsilon: 0.05 },
            },
        });
        const a = mockCircleBody(0, 0, 10, 0.6, 0);
        const b = mockCircleBody(18, 0, 10, 0.55, 0);
        const tick = createKineticTestTick([a, b]);
        resolveKineticContactPass(tick);
        const stats = tick.world.kinetic.kineticContactStats;
        assert.ok(stats.restingCount > 0);
        assert.equal(stats.innerIterations, 1);
        applyGameCollisionSettings(null);
    });

    it("warm-started second frame keeps feature-id cache for slow overlap", () => {
        applyGameCollisionSettings({
            collisionSettings: {
                kineticWarmStartDecay: 1,
                kineticResting: { normalVelocityEpsilon: 0.05, tangentVelocityEpsilon: 0.05 },
            },
        });
        const a = mockCircleBody(0, 0, 10, 0.6, 0);
        const b = mockCircleBody(18, 0, 10, 0.55, 0);
        const tick = createKineticTestTick([a, b]);
        resolveKineticContactPass(tick);
        assert.ok(tick.world.kinetic.kineticContactStats.maxImpulse > 0.05);
        resolveKineticContactPass(tick);
        const stats = tick.world.kinetic.kineticContactStats;
        assert.ok(stats.restingCount > 0);
        assert.equal(stats.innerIterations, 1);
        applyGameCollisionSettings(null);
    });
});
