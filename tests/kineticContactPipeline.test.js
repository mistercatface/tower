import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { satCheckCollision, checkEntityPairCollision, entityFacing } from "../Libraries/Physics/physics.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Physics/physics.js";
import { KINETIC_PAIR_TIER } from "../Libraries/Physics/physics.js";
import { setPropRadius } from "../Libraries/Props/props.js";
import { createKineticTestTick, mockKineticCircle } from "./harness/kineticTickHarness.js";
import { checkPairAtSlabPose } from "./harness/kineticContactHarness.js";

function largeBall(x, y) {
    const prop = new WorldProp(x, y, "ball", 0);
    setPropRadius(prop, 7);
    return prop;
}

function slabPairCollision(a, b) {
    return checkPairAtSlabPose(a, b);
}

describe("kinetic contact pipeline", () => {
    it("circle and poly contacts share one buffer in a mixed pass", () => {
        const ball = largeBall(0, 0);
        const wedge = new WorldProp(10, 0, "tri_wedge", 0);
        wedge.vx = -20;
        assert.ok(satCheckCollision(ball.x, ball.y, entityFacing(ball), ball.shape, wedge.x, wedge.y, entityFacing(wedge), wedge.shape));
        const tick = createKineticTestTick([ball, wedge]);
        resolveKineticContactPassWithPairs(tick, gatherKineticContactPairs(tick));
        assert.equal(kineticContactBuffer.count, 1);
        assert.equal(kineticContactBuffer.static.tier[0], KINETIC_PAIR_TIER.CIRCLE_POLY);
        assert.ok(!slabPairCollision(ball, wedge));
    });

    it("circle-only pass fills buffer with circle-circle tier", () => {
        const a = mockKineticCircle(0, 0, 10, 50, 0);
        const b = mockKineticCircle(15, 0, 10, -30, 0);
        const tick = createKineticTestTick([a, b]);
        resolveKineticContactPassWithPairs(tick, gatherKineticContactPairs(tick));
        assert.equal(kineticContactBuffer.count, 1);
        assert.equal(kineticContactBuffer.static.tier[0], KINETIC_PAIR_TIER.CIRCLE_CIRCLE);
    });

    it("poly-poly pass fills buffer with poly-poly tier", () => {
        const left = new WorldProp(0, 0, "crate", 0);
        const right = new WorldProp(10, 0, "crate", 0);
        right.vx = -20;
        assert.ok(checkEntityPairCollision(left, right));
        const tick = createKineticTestTick([left, right]);
        resolveKineticContactPassWithPairs(tick, gatherKineticContactPairs(tick));
        assert.equal(kineticContactBuffer.count, 2);
        assert.equal(kineticContactBuffer.static.tier[0], KINETIC_PAIR_TIER.POLY_POLY);
        assert.equal(kineticContactBuffer.static.tier[1], KINETIC_PAIR_TIER.POLY_POLY);
        assert.ok(!slabPairCollision(left, right));
    });
});
