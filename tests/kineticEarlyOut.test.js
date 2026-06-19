import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyGameCollisionSettings } from "../Core/GameCollisionSettings.js";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { addDistanceConstraint, resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { runCollisionPipeline } from "../Libraries/Spatial/collision/collisionPipeline.js";
import { createKineticTestTick } from "./harness/kineticTickHarness.js";

let nextId = 1;
function mockCircleBody(x, y, radius) {
    return {
        id: nextId++,
        x,
        y,
        radius,
        vx: 0,
        vy: 0,
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

describe("kinetic early-out", () => {
    it("stops outer iterations early on settled constraint chain", () => {
        applyGameCollisionSettings({ collisionSettings: { kineticIterations: 4, kineticEarlyOut: { enabled: true, minIterations: 1, velocityEpsilonSq: 0.04, constraintErrorEpsilon: 1e-3, persistPairs: true } } });
        resetKineticConstraintIds(1);
        const bodyA = mockCircleBody(0, 0, 10);
        const bodyB = mockCircleBody(20, 0, 10);
        const tick = createKineticTestTick([bodyA, bodyB], { constraintsDirty: true });
        addDistanceConstraint(tick.session, { bodyAId: bodyA.id, bodyBId: bodyB.id, restLength: 20 });
        runCollisionPipeline(tick, { resolveWalls: () => {} });
        assert.ok(tick.session.kineticSolverStats.outerIterations < tick.session.kineticSolverStats.maxIterations);
        applyGameCollisionSettings(null);
    });
});
