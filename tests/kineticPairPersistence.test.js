import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyGameCollisionSettings } from "../Core/GameCollisionSettings.js";
import { KineticSpatialFrame } from "../Systems/World/KineticSpatialFrame.js";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { runCollisionPipeline } from "../Libraries/Spatial/collision/collisionPipeline.js";
import { persistedKineticPairBuffer } from "../Libraries/Spatial/collision/kineticPairStream.js";
import { activeBodiesMatchKineticSlab } from "../Libraries/Spatial/collision/kineticBodySlab.js";
import { snapshotActiveBroadphaseBounds } from "../Libraries/Spatial/collision/entityBroadphase.js";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { SatCollision } from "../Libraries/Spatial/collision/SatCollision.js";
import { setCirclePropRadius } from "../Libraries/Props/propScale.js";

loadPropAssets();

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
        needsWallCollision() {
            return false;
        },
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

function createState(props) {
    return {
        worldProps: props.slice(),
        sandbox: { kineticConstraints: [], kineticConstraintsDirty: false },
        entityRegistry: {
            getLive(id) {
                for (let i = 0; i < props.length; i++) if (props[i].id === id) return props[i];
                return null;
            },
        },
        wallResolver: { resolve() {} },
    };
}

describe("kinetic pair persistence", () => {
    it("reuses gathered pair list across outer iterations when persistPairs is on", () => {
        applyGameCollisionSettings({
            collisionSettings: {
                kineticIterations: 3,
                kineticEarlyOut: { enabled: false, persistPairs: true, minIterations: 1, velocityEpsilonSq: 0.04, constraintErrorEpsilon: 1e-3, contactMinIterations: 1, contactImpulseEpsilon: 1e-4 },
            },
        });
        const a = mockCircleBody(0, 0, 10, 50, 0);
        const b = mockCircleBody(14, 0, 10, -40, 0);
        const state = createState([a, b]);
        const frame = setupFrame([a, b]);
        const ax0 = a.x;
        runCollisionPipeline(state, frame, { resolveWalls: () => {} });
        assert.equal(state.sandbox.kineticSolverStats.outerIterations, 3);
        assert.equal(persistedKineticPairBuffer.count, 1);
        assert.ok(a.x !== ax0 || b.x !== 14);
        applyGameCollisionSettings(null);
    });

    it("syncs body slab before early-out when props moved after constraints", () => {
        applyGameCollisionSettings({
            collisionSettings: {
                kineticIterations: 4,
                kineticEarlyOut: { enabled: true, persistPairs: true, minIterations: 1, velocityEpsilonSq: 0.04, constraintErrorEpsilon: 1e-3, contactMinIterations: 1, contactImpulseEpsilon: 1e-4 },
            },
        });
        const bodyA = mockCircleBody(0, 0, 10);
        const bodyB = mockCircleBody(20, 0, 10);
        const state = createState([bodyA, bodyB]);
        state.sandbox.kineticConstraints.push({ id: 1, type: "distance", bodyAId: bodyA.id, bodyBId: bodyB.id, anchorA: { x: 0, y: 0 }, anchorB: { x: 0, y: 0 }, restLength: 20 });
        state.sandbox.kineticConstraintsDirty = true;
        const frame = setupFrame([bodyA, bodyB]);
        runCollisionPipeline(state, frame, { resolveWalls: () => {} });
        snapshotActiveBroadphaseBounds(frame._activeKineticBodies);
        assert.ok(activeBodiesMatchKineticSlab(frame._activeKineticBodies));
        assert.ok(state.sandbox.kineticSolverStats.outerIterations <= state.sandbox.kineticSolverStats.maxIterations);
        applyGameCollisionSettings(null);
    });

    it("warm-starts mixed circle-poly contact across consecutive pipeline passes", () => {
        applyGameCollisionSettings({
            collisionSettings: {
                kineticIterations: 2,
                kineticEarlyOut: { enabled: false, persistPairs: true, minIterations: 1, velocityEpsilonSq: 0.04, constraintErrorEpsilon: 1e-3, contactMinIterations: 1, contactImpulseEpsilon: 1e-4 },
            },
        });
        const ball = new WorldProp(0, 0, "ball", 0);
        setCirclePropRadius(ball, 7);
        const wedge = new WorldProp(10, 0, "tri_wedge", 0);
        wedge.vx = -25;
        assert.ok(SatCollision.checkCollision(ball, ball.getShape(), wedge, wedge.getShape()));
        const state = createState([ball, wedge]);
        const frame = setupFrame([ball, wedge]);
        runCollisionPipeline(state, frame, { resolveWalls: () => {} });
        wedge.vx = -25;
        runCollisionPipeline(state, frame, { resolveWalls: () => {} });
        assert.ok(!SatCollision.checkCollision(ball, ball.getShape(), wedge, wedge.getShape()));
        applyGameCollisionSettings(null);
    });
});
