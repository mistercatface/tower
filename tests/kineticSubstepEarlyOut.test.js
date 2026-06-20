import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyGameCollisionSettings } from "../Core/GameCollisionSettings.js";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { countMotionSubsteps } from "../Libraries/Motion/motionSubsteps.js";
import { runKineticPhysics } from "../Libraries/Motion/kineticPhysicsPass.js";
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
        currentState: {},
        strategy: { isKinetic: true },
        mass: radius,
        get momentOfInertia() {
            return this.mass * this.radius * this.radius * 0.5;
        },
        getShape() {
            return new CircleShape(this.radius);
        },
        update(dt) {
            this.x += (this.vx ?? 0) * (dt / 1000);
            this.y += (this.vy ?? 0) * (dt / 1000);
            this.vx *= 0.02;
            this.vy *= 0.02;
        },
        needsWallCollision() {
            return false;
        },
    };
}

describe("kinetic substep early-out", () => {
    it("skips remaining substeps once bodies fall below velocity epsilon", () => {
        applyGameCollisionSettings({
            collisionSettings: {
                motionSubsteps: { maxStepPx: 4, maxSubsteps: 8 },
                kineticEarlyOut: { enabled: true, velocityEpsilonSq: 0.04 },
                substepEarlyOut: { enabled: true },
            },
        });
        const body = mockCircleBody(0, 0, 10, 120, 0);
        const dt = 100;
        const tick = createKineticTestTick([body]);
        const planned = countMotionSubsteps(dt, tick.frame._activeKineticBodies, { maxStepPx: 4, maxSubsteps: 8 });
        assert.ok(planned > 1);
        runKineticPhysics(tick, dt, {
            updateProp: (prop, subDt) => prop.update(subDt),
            resolveWalls: () => {},
            applyContactSideEffects: () => {},
        });
        assert.ok(tick.world.kinetic.motionSubstepStats.substepsRun < tick.world.kinetic.motionSubstepStats.substepsPlanned);
        applyGameCollisionSettings(null);
    });
});
