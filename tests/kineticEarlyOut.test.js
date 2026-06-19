import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyGameCollisionSettings } from "../Core/GameCollisionSettings.js";
import { KineticSpatialFrame } from "../Systems/World/KineticSpatialFrame.js";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { createKineticSession } from "../GameState/KineticSession.js";
import { addDistanceConstraint, resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { runCollisionPipeline } from "../Libraries/Spatial/collision/collisionPipeline.js";

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

function createState(props, constraints = []) {
    return {
        worldProps: props.slice(),
        kinetic: createKineticSession({ constraints, constraintsDirty: true }),
        sandbox: {},
        entityRegistry: {
            getLive(id) {
                for (let i = 0; i < props.length; i++) if (props[i].id === id) return props[i];
                return null;
            },
        },
        wallResolver: { resolve() {} },
    };
}

function setupFrame(bodies) {
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

describe("kinetic early-out", () => {
    it("stops outer iterations early on settled constraint chain", () => {
        applyGameCollisionSettings({ collisionSettings: { kineticIterations: 4, kineticEarlyOut: { enabled: true, minIterations: 1, velocityEpsilonSq: 0.04, constraintErrorEpsilon: 1e-3, persistPairs: true } } });
        resetKineticConstraintIds(1);
        const bodyA = mockCircleBody(0, 0, 10);
        const bodyB = mockCircleBody(20, 0, 10);
        const state = createState([bodyA, bodyB]);
        addDistanceConstraint(state.kinetic, { bodyAId: bodyA.id, bodyBId: bodyB.id, restLength: 20 });
        const frame = setupFrame([bodyA, bodyB]);
        runCollisionPipeline(state, frame, { resolveWalls: () => {} });
        assert.ok(state.kinetic.kineticSolverStats.outerIterations < state.kinetic.kineticSolverStats.maxIterations);
        applyGameCollisionSettings(null);
    });
});
