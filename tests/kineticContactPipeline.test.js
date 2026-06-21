import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { SatCollision, checkEntityPairCollision } from "../Libraries/Spatial/collision/SatCollision.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { KINETIC_PAIR_TIER } from "../Libraries/Spatial/collision/kineticNarrowPhase.js";
import { setCirclePropRadius } from "../Libraries/Props/propScale.js";
import { createKineticTestTick } from "./harness/kineticTickHarness.js";

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

describe("kinetic contact pipeline", () => {
    it("circle and poly contacts share one buffer in a mixed pass", () => {
        const ball = largeBall(0, 0);
        const wedge = new WorldProp(10, 0, "tri_wedge", 0);
        wedge.vx = -20;
        assert.ok(SatCollision.checkCollision(ball, ball.getShape(), wedge, wedge.getShape()));
        const tick = createKineticTestTick([ball, wedge]);
        resolveKineticContactPassWithPairs(tick, gatherKineticContactPairs(tick));
        assert.equal(kineticContactBuffer.count, 1);
        assert.equal(kineticContactBuffer.tier[0], KINETIC_PAIR_TIER.CIRCLE_POLY);
        assert.ok(!SatCollision.checkCollision(ball, ball.getShape(), wedge, wedge.getShape()));
    });

    it("circle-only pass fills buffer with circle-circle tier", () => {
        const a = mockCircleBody(0, 0, 10, 50, 0);
        const b = mockCircleBody(15, 0, 10, -30, 0);
        const tick = createKineticTestTick([a, b]);
        resolveKineticContactPassWithPairs(tick, gatherKineticContactPairs(tick));
        assert.equal(kineticContactBuffer.count, 1);
        assert.equal(kineticContactBuffer.tier[0], KINETIC_PAIR_TIER.CIRCLE_CIRCLE);
    });

    it("poly-poly pass fills buffer with poly-poly tier", () => {
        const left = new WorldProp(0, 0, "crate", 0);
        const right = new WorldProp(10, 0, "crate", 0);
        right.vx = -20;
        assert.ok(checkEntityPairCollision(left, right));
        const tick = createKineticTestTick([left, right]);
        resolveKineticContactPassWithPairs(tick, gatherKineticContactPairs(tick));
        assert.equal(kineticContactBuffer.count, 2);
        assert.equal(kineticContactBuffer.tier[0], KINETIC_PAIR_TIER.POLY_POLY);
        assert.equal(kineticContactBuffer.tier[1], KINETIC_PAIR_TIER.POLY_POLY);
        assert.equal(checkEntityPairCollision(left, right), null);
    });
});
