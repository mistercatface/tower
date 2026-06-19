import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { KineticSpatialFrame } from "../Systems/World/KineticSpatialFrame.js";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { addDistanceConstraint, pruneKineticConstraintsForBody, resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { distanceBetweenAnchors } from "../Libraries/Motion/constraintAnchors.js";
import { measureDistanceConstraintError, resolveKineticConstraintPass } from "../Libraries/Motion/kineticConstraintSolver.js";
import { resolveKineticContactPass } from "../Libraries/Spatial/collision/kineticContactSolver.js";
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
    };
}
function createConstraintTestState(props, constraints = []) {
    return {
        worldProps: props.slice(),
        sandbox: { kineticConstraints: constraints.slice() },
        entityRegistry: {
            getLive(id) {
                for (let i = 0; i < props.length; i++) if (props[i].id === id) return props[i];
                return null;
            },
        },
    };
}
function setupActiveFrame(bodies) {
    const frame = new KineticSpatialFrame(50);
    frame.resetFrame({ minX: -500, maxX: 500, minY: -500, maxY: 500 });
    for (let i = 0; i < bodies.length; i++) {
        frame.insertEntity(bodies[i], i);
        bodies[i]._physId = i;
    }
    frame._kineticBodies = bodies.slice();
    frame._activeKineticBodies = bodies.slice();
    return frame;
}
describe("kinetic constraint solver", () => {
    it("pulls stretched distance joint back toward rest length", () => {
        resetKineticConstraintIds(1);
        const bodyA = mockCircleBody(0, 0, 10);
        const bodyB = mockCircleBody(30, 0, 10);
        const restLength = 30;
        const state = createConstraintTestState([bodyA, bodyB]);
        const constraint = addDistanceConstraint(state.sandbox, { bodyAId: bodyA.id, bodyBId: bodyB.id, restLength });
        bodyB.x = 50;
        const frame = setupActiveFrame([bodyA, bodyB]);
        for (let pass = 0; pass < 8; pass++) resolveKineticConstraintPass(frame, state);
        const dist = distanceBetweenAnchors(bodyA, constraint.anchorA, bodyB, constraint.anchorB);
        assert.ok(Math.abs(dist - restLength) < 0.5, `expected ~${restLength}, got ${dist}`);
        assert.ok(measureDistanceConstraintError(state, constraint) < 0.5);
    });
    it("leaves unlinked bodies unchanged when contact pass runs", () => {
        const bodyA = mockCircleBody(0, 0, 10);
        const bodyB = mockCircleBody(40, 0, 10);
        const state = createConstraintTestState([bodyA, bodyB]);
        const frame = setupActiveFrame([bodyA, bodyB]);
        const ax = bodyA.x;
        const bx = bodyB.x;
        resolveKineticContactPass(frame, state.sandbox);
        resolveKineticConstraintPass(frame, state);
        assert.equal(bodyA.x, ax);
        assert.equal(bodyB.x, bx);
    });
    it("drops constraints when a linked body is removed", () => {
        resetKineticConstraintIds(1);
        const bodyA = mockCircleBody(0, 0, 10);
        const bodyB = mockCircleBody(30, 0, 10);
        const state = createConstraintTestState([bodyA, bodyB]);
        addDistanceConstraint(state.sandbox, { bodyAId: bodyA.id, bodyBId: bodyB.id, restLength: 30 });
        assert.equal(state.sandbox.kineticConstraints.length, 1);
        pruneKineticConstraintsForBody(state.sandbox, bodyB.id);
        assert.equal(state.sandbox.kineticConstraints.length, 0);
    });
});
