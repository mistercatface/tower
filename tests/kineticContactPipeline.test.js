import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { readEntityFacing, snapshotKineticBodySlab } from "../Libraries/Physics/physics.js";
import { satCheckCollision } from "./harness/satCollisionHarness.js";
import { gatherKineticContactPairs, resolveKineticContactPassWithPairs } from "../Libraries/Physics/physics.js";
import { KINETIC_PAIR_CIRCLE_CIRCLE, KINETIC_PAIR_CIRCLE_POLY, KINETIC_PAIR_POLY_POLY } from "../Core/engineEnums.js";
import { setCirclePropRadius } from "../Libraries/Props/props.js";
import { createKineticTestTick, mockKineticCircle, assignPhysIdWithPose } from "./harness/kineticTickHarness.js";
import { checkPairAtSlabPose } from "./harness/kineticContactHarness.js";

function largeBall(x, y) {
    const prop = new WorldProp(x, y, "ball", 0);
    setCirclePropRadius(prop, 7);
    return prop;
}

describe("kinetic contact pipeline", () => {
    it("circle and poly contacts share one buffer in a mixed pass", () => {
        const ball = largeBall(0, 0);
        const wedge = new WorldProp(10, 0, "tri_wedge", 0);
        wedge.vx = -20;
        assert.ok(satCheckCollision(ball.x, ball.y, readEntityFacing(ball), ball.shape, wedge.x, wedge.y, readEntityFacing(wedge), wedge.shape));
        const tick = createKineticTestTick([ball, wedge]);
        const contacts = resolveKineticContactPassWithPairs(tick, gatherKineticContactPairs(tick));
        assert.equal(contacts.count, 1);
        assert.equal(contacts.static.tier[0], KINETIC_PAIR_CIRCLE_POLY);
        assert.ok(!checkPairAtSlabPose(ball, wedge));
    });

    it("circle-only pass fills buffer with circle-circle tier", () => {
        const a = mockKineticCircle(0, 0, 10, 50, 0);
        const b = mockKineticCircle(15, 0, 10, -30, 0);
        const tick = createKineticTestTick([a, b]);
        const contacts = resolveKineticContactPassWithPairs(tick, gatherKineticContactPairs(tick));
        assert.equal(contacts.count, 1);
        assert.equal(contacts.static.tier[0], KINETIC_PAIR_CIRCLE_CIRCLE);
    });

    it("poly-poly pass fills buffer with poly-poly tier", () => {
        const left = new WorldProp(0, 0, "box", 0);
        const right = new WorldProp(10, 0, "box", 0);
        right.vx = -20;
        assignPhysIdWithPose(left, 0);
        assignPhysIdWithPose(right, 1);
        snapshotKineticBodySlab([0, 1], 2);
        assert.ok(checkPairAtSlabPose(left, right));
        const tick = createKineticTestTick([left, right]);
        const contacts = resolveKineticContactPassWithPairs(tick, gatherKineticContactPairs(tick));
        assert.ok(contacts.count >= 1);
        assert.equal(contacts.static.tier[0], KINETIC_PAIR_POLY_POLY);
        assert.ok(!checkPairAtSlabPose(left, right));
    });
});
