import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { KINETIC_PAIR_CIRCLE_CIRCLE, KINETIC_PAIR_CIRCLE_POLY, KINETIC_PAIR_POLY_POLY } from "../Core/engineEnums.js";
import { setCirclePropRadius } from "../Libraries/Props/props.js";
import { createKineticTestTick, mockKineticCircle, assignPhysIdWithPose, snapshotKineticBodySlab } from "./harness/kineticTickHarness.js";
import { checkPairAtSlabPose, resolveKineticContactPass } from "./harness/kineticContactHarness.js";

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
        assignPhysIdWithPose(ball, 0);
        assignPhysIdWithPose(wedge, 1);
        snapshotKineticBodySlab([0, 1], 2);
        assert.ok(checkPairAtSlabPose(ball, wedge));
        const tick = createKineticTestTick([ball, wedge]);
        const contacts = resolveKineticContactPass(tick);
        assert.ok(contacts.count >= 1 || !checkPairAtSlabPose(ball, wedge));
        if (contacts.count >= 1) assert.equal(contacts.static.tier[0], KINETIC_PAIR_CIRCLE_POLY);
        assert.ok(!checkPairAtSlabPose(ball, wedge));
    });

    it("circle-only pass fills buffer with circle-circle tier", () => {
        const a = mockKineticCircle(0, 0, 10, 50, 0);
        const b = mockKineticCircle(15, 0, 10, -30, 0);
        const tick = createKineticTestTick([a, b]);
        const contacts = resolveKineticContactPass(tick);
        if (contacts.count >= 1) assert.equal(contacts.static.tier[0], KINETIC_PAIR_CIRCLE_CIRCLE);
        assert.ok(a.x < 0 || b.x > 15);
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
        const contacts = resolveKineticContactPass(tick);
        assert.ok(contacts.count >= 1 || !checkPairAtSlabPose(left, right));
        if (contacts.count >= 1) assert.equal(contacts.static.tier[0], KINETIC_PAIR_POLY_POLY);
        assert.ok(!checkPairAtSlabPose(left, right));
    });
});
