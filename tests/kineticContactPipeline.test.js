import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { SatCollision, checkEntityPairCollision } from "../Libraries/Spatial/collision/SatCollision.js";
import { KineticSpatialFrame } from "../Systems/World/KineticSpatialFrame.js";
import { createKineticSession } from "../GameState/KineticSession.js";
import { createContactPassTick } from "../GameState/KineticTick.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { KINETIC_PAIR_TIER } from "../Libraries/Spatial/collision/kineticNarrowPhase.js";
import { setCirclePropRadius } from "../Libraries/Props/propScale.js";

loadPropAssets();

let nextId = 1;

function largeBall(x, y) {
    const prop = new WorldProp(x, y, "ball", 0);
    setCirclePropRadius(prop, 7);
    return prop;
}

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

function setupPairFrame(a, b) {
    const frame = new KineticSpatialFrame(50);
    frame.resetFrame({ minX: -500, maxX: 500, minY: -500, maxY: 500 });
    frame.insertEntity(a, 0);
    frame.insertEntity(b, 1);
    a._physId = 0;
    b._physId = 1;
    frame._kineticBodies = [a, b];
    frame._activeKineticBodies = [a, b];
    return frame;
}

describe("kinetic contact pipeline", () => {
    it("circle and poly contacts share one buffer in a mixed pass", () => {
        const ball = largeBall(0, 0);
        const wedge = new WorldProp(10, 0, "tri_wedge", 0);
        wedge.vx = -20;
        assert.ok(SatCollision.checkCollision(ball, ball.getShape(), wedge, wedge.getShape()));
        const frame = setupPairFrame(ball, wedge);
        const tick = createContactPassTick(frame, createKineticSession());
        resolveKineticContactPassWithPairs(frame, gatherKineticContactPairs(tick));
        assert.equal(kineticContactBuffer.count, 1);
        assert.equal(kineticContactBuffer.tier[0], KINETIC_PAIR_TIER.CIRCLE_POLY);
        assert.ok(!SatCollision.checkCollision(ball, ball.getShape(), wedge, wedge.getShape()));
    });

    it("circle-only pass fills buffer with circle-circle tier", () => {
        const a = mockCircleBody(0, 0, 10, 50, 0);
        const b = mockCircleBody(15, 0, 10, -30, 0);
        const frame = setupPairFrame(a, b);
        const tick = createContactPassTick(frame, createKineticSession());
        resolveKineticContactPassWithPairs(frame, gatherKineticContactPairs(tick));
        assert.equal(kineticContactBuffer.count, 1);
        assert.equal(kineticContactBuffer.tier[0], KINETIC_PAIR_TIER.CIRCLE_CIRCLE);
    });

    it("poly-poly pass fills buffer with poly-poly tier", () => {
        const left = new WorldProp(0, 0, "crate", 0);
        const right = new WorldProp(10, 0, "crate", 0);
        right.vx = -20;
        assert.ok(checkEntityPairCollision(left, right));
        const frame = setupPairFrame(left, right);
        const tick = createContactPassTick(frame, createKineticSession());
        resolveKineticContactPassWithPairs(frame, gatherKineticContactPairs(tick));
        assert.equal(kineticContactBuffer.count, 1);
        assert.equal(kineticContactBuffer.tier[0], KINETIC_PAIR_TIER.POLY_POLY);
        assert.equal(checkEntityPairCollision(left, right), null);
    });
});
