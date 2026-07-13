import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp, applyPropBoxFootprint, setCirclePropRadius } from "../Libraries/Props/props.js";
import { SAT_RESULT } from "../Libraries/Physics/physics.js";
import { resolveKineticContactPass, checkPairAtSlabPose } from "./harness/kineticContactHarness.js";
import { kineticDynamicSlab } from "../Core/engineMemory.js";
import { createKineticTestTick, mockKineticCircle, assignPhysIdWithPose, snapshotKineticBodySlab } from "./harness/kineticTickHarness.js";

function resolveContactUntilClear(tick, a, b, maxPasses = 8) {
    for (let pass = 0; pass < maxPasses; pass++) {
        resolveKineticContactPass(tick);
        if (!checkPairAtSlabPose(a, b)) return;
    }
}

describe("kinetic contact solver", () => {
    it("separates overlapping circles and applies opposing impulses", () => {
        const a = mockKineticCircle(0, 0, 10, 50, 0);
        const b = mockKineticCircle(15, 0, 10, -30, 0);
        resolveKineticContactPass(createKineticTestTick([a, b]));
        assert.ok(kineticDynamicSlab.x[a._physId] < 0);
        assert.ok(kineticDynamicSlab.x[b._physId] > 15);
        assert.ok(kineticDynamicSlab.vx[a._physId] < 50);
        assert.ok(kineticDynamicSlab.vx[b._physId] > -30);
    });
    it("friction reduces tangential slip between contacting circles", () => {
        const a = mockKineticCircle(0, 0, 10, 40, 0, { pairFriction: 0.8 });
        const b = mockKineticCircle(12, 0, 10, 0, 0, { pairFriction: 0.8 });
        resolveKineticContactPass(createKineticTestTick([a, b]));
        assert.ok(Math.abs(kineticDynamicSlab.vx[a._physId]) < 40);
    });
    it("resting overlapping circles are left alone until one moves", () => {
        const a = mockKineticCircle(0, 0, 10, 0, 0);
        const b = mockKineticCircle(15, 0, 10, 0, 0);
        const ax0 = a.x;
        const bx0 = b.x;
        resolveKineticContactPass(createKineticTestTick([a, b]));
        assert.equal(a.x, ax0);
        assert.equal(b.x, bx0);
    });
});
describe("poly-poly kinetic contact", () => {
    it("resolveKineticContactPass separates overlapping bar and crate", () => {
        const bar = new WorldProp(0, 0, "box", 0);
        applyPropBoxFootprint(bar, 8, 4);
        const box = new WorldProp(12, 0, "box", 0);
        box.vx = -20;
        assignPhysIdWithPose(bar, 0);
        assignPhysIdWithPose(box, 1);
        snapshotKineticBodySlab([0, 1], 2);
        assert.ok(checkPairAtSlabPose(bar, box));
        const tick = createKineticTestTick([bar, box]);
        resolveContactUntilClear(tick, bar, box);
        assert.ok(!checkPairAtSlabPose(bar, box));
    });
    it("approaching poly pair slows head-on approach and separates", () => {
        const a = new WorldProp(0, 0, "hex_block", 0);
        const b = new WorldProp(10, 0, "hex_block", 0);
        a.vx = 40;
        b.vx = -20;
        const tick = createKineticTestTick([a, b]);
        resolveContactUntilClear(tick, a, b);
        assert.ok(!checkPairAtSlabPose(a, b));
        assert.ok(kineticDynamicSlab.vx[a._physId] < 40);
        assert.ok(kineticDynamicSlab.vx[b._physId] > -20);
    });
    it("poly pair friction reduces tangential slip on block slide", () => {
        const left = new WorldProp(0, 0, "box", 0);
        applyPropBoxFootprint(left, 8, 4);
        const right = new WorldProp(12, 0, "box", 0);
        applyPropBoxFootprint(right, 8, 4);
        left.vx = 35;
        right.vx = 0;
        resolveKineticContactPass(createKineticTestTick([left, right]));
        assert.ok(kineticDynamicSlab.vx[left._physId] < 35);
    });
    it("poly-poly crate overlap emits two manifold points", () => {
        const left = new WorldProp(0, 0, "box", 0);
        const right = new WorldProp(10, 0, "box", 0);
        assignPhysIdWithPose(left, 0);
        assignPhysIdWithPose(right, 1);
        snapshotKineticBodySlab([0, 1], 2);
        const collided = checkPairAtSlabPose(left, right);
        assert.ok(collided);
        assert.equal(SAT_RESULT[8], 2);
    });
    it("three-crate stack settles without lateral drift", () => {
        const bottom = new WorldProp(0, 0, "box", 0);
        const middle = new WorldProp(0, 12, "box", 0);
        const top = new WorldProp(0, 24, "box", 0);
        const tick = createKineticTestTick([bottom, middle, top]);
        for (let pass = 0; pass < 10; pass++) resolveKineticContactPass(tick);
        assert.ok(Math.abs(kineticDynamicSlab.x[bottom._physId]) < 0.5);
        assert.ok(Math.abs(kineticDynamicSlab.x[middle._physId]) < 0.5);
        assert.ok(Math.abs(kineticDynamicSlab.x[top._physId]) < 0.5);
    });
    it("circle-poly ball and tri wedge separate via contact pass", () => {
        const ball = new WorldProp(0, 0, "ball", 0);
        setCirclePropRadius(ball, 7);
        const wedge = new WorldProp(10, 0, "tri_wedge", 0);
        wedge.vx = -20;
        const tick = createKineticTestTick([ball, wedge]);
        resolveContactUntilClear(tick, ball, wedge);
        assert.ok(!checkPairAtSlabPose(ball, wedge));
    });
});
