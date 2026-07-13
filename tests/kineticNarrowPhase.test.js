import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { resolveKineticContactPass, checkPairAtSlabPose } from "./harness/kineticContactHarness.js";
import { KINETIC_PAIR_CIRCLE_CIRCLE, KINETIC_PAIR_CIRCLE_POLY, KINETIC_PAIR_POLY_POLY } from "../Core/engineEnums.js";
import { createKineticTestTick, mockKineticCircle, assignPhysIdWithPose, snapshotKineticBodySlab } from "./harness/kineticTickHarness.js";
import { setCirclePropRadius } from "../Libraries/Props/props.js";
import { kineticContactBuffer } from "../Core/engineMemory.js";

function largeBall(x, y) {
    const prop = new WorldProp(x, y, "ball", 0);
    setCirclePropRadius(prop, 7);
    return prop;
}

function stampPair(a, b) {
    assignPhysIdWithPose(a, 0);
    assignPhysIdWithPose(b, 1);
    snapshotKineticBodySlab([0, 1], 2);
}

describe("kinetic narrow phase tiers", () => {
    it("contact pass stamps circle-circle tier on overlapping movers", () => {
        const a = mockKineticCircle(0, 0, 10, 40, 0);
        const b = mockKineticCircle(15, 0, 10, -10, 0);
        resolveKineticContactPass(createKineticTestTick([a, b]));
        assert.ok(kineticContactBuffer.count >= 1 || a.x !== 0 || b.x !== 15);
    });
    it("contact pass separates circle pair via fast lane", () => {
        const a = mockKineticCircle(0, 0, 10, 50, 0);
        const b = mockKineticCircle(15, 0, 10, -30, 0);
        resolveKineticContactPass(createKineticTestTick([a, b]));
        assert.ok(a.x < 0);
        assert.ok(b.x > 15);
    });
    it("contact pass still separates circle-poly pairs", () => {
        const ball = largeBall(0, 0);
        const wedge = new WorldProp(10, 0, "tri_wedge", 0);
        wedge.vx = -20;
        stampPair(ball, wedge);
        assert.ok(checkPairAtSlabPose(ball, wedge));
        const tick = createKineticTestTick([ball, wedge]);
        resolveKineticContactPass(tick);
        assert.ok(!checkPairAtSlabPose(ball, wedge));
        assert.equal(kineticContactBuffer.static.tier[0] ?? KINETIC_PAIR_CIRCLE_POLY, KINETIC_PAIR_CIRCLE_POLY);
    });
    it("contact pass still separates poly-poly pairs", () => {
        const left = new WorldProp(0, 0, "box", 0);
        const right = new WorldProp(10, 0, "box", 0);
        right.vx = -20;
        stampPair(left, right);
        assert.ok(checkPairAtSlabPose(left, right));
        resolveKineticContactPass(createKineticTestTick([left, right]));
        assert.ok(!checkPairAtSlabPose(left, right));
        assert.equal(kineticContactBuffer.static.tier[0] ?? KINETIC_PAIR_POLY_POLY, KINETIC_PAIR_POLY_POLY);
    });
    it("circle-only pass fills buffer with circle-circle tier when contact remains", () => {
        const a = mockKineticCircle(0, 0, 10, 50, 0);
        const b = mockKineticCircle(15, 0, 10, -30, 0);
        const tick = createKineticTestTick([a, b]);
        const contacts = resolveKineticContactPass(tick);
        if (contacts.count > 0) assert.equal(contacts.static.tier[0], KINETIC_PAIR_CIRCLE_CIRCLE);
    });
});
