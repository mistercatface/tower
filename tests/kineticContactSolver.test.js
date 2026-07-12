import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { applyPropBoxFootprint } from "../Libraries/Props/props.js";
import { satCheckCollision, checkEntityPairCollision, readEntityFacing, SAT_RESULT } from "../Libraries/Physics/physics.js";
import { separateAlongNormal } from "../Libraries/Physics/physics.js";
import { resolveKineticContactPass, checkPairAtSlabPose } from "./harness/kineticContactHarness.js";
import { gatherKineticContactPairs, resolveKineticContactPassWithPairs } from "../Libraries/Physics/physics.js";
import { kineticDynamicSlab } from "../Core/engineMemory.js";
import { createKineticTestTick, mockKineticCircle } from "./harness/kineticTickHarness.js";
import { kineticMassFromFootprint } from "../Libraries/Physics/physics.js";
import { dotXY } from "../Libraries/Math/math.js";
import { setCirclePropRadius } from "../Libraries/Props/props.js";
function pairStillOverlaps(a, b) {
    return satCheckCollision(a.x, a.y, readEntityFacing(a), a.shape, b.x, b.y, readEntityFacing(b), b.shape);
}
function slabPairStillOverlaps(a, b) {
    return checkPairAtSlabPose(a, b);
}
function separatePairUntilClear(a, b, maxPasses = 8) {
    let last = null;
    for (let pass = 0; pass < maxPasses; pass++) {
        const collided = satCheckCollision(a.x, a.y, readEntityFacing(a), a.shape, b.x, b.y, readEntityFacing(b), b.shape);
        if (!collided) return last;
        last = {
            overlap: SAT_RESULT[0],
            nx: SAT_RESULT[1],
            ny: SAT_RESULT[2],
            coincident: SAT_RESULT[5] !== 0,
            featureA: SAT_RESULT[6],
            featureB: SAT_RESULT[7]
        };
        if (last.coincident) break;
        separateAlongNormal(a, b, last.nx, last.ny, last.overlap, kineticMassFromFootprint(a), kineticMassFromFootprint(b));
    }
    return last;
}
function resolveContactUntilClear(tick, maxPasses = 4) {
    const pairs = gatherKineticContactPairs(tick);
    for (let pass = 0; pass < maxPasses; pass++) {
        resolveKineticContactPassWithPairs(tick, pairs);
        const [a, b] = tick.frame._activeKineticBodies;
        if (!slabPairStillOverlaps(a, b)) return;
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
    it("axis-aligned crate pair separates with +x normal when B is to the right", () => {
        const left = new WorldProp(0, 0, "box", 0);
        const right = new WorldProp(10, 0, "box", 0);
        const info = separatePairUntilClear(left, right);
        assert.ok(info);
        assert.ok(info.overlap > 0);
        assert.ok(info.nx > 0.9);
        assert.ok(Math.abs(info.ny) < 0.1);
        assert.ok(!pairStillOverlaps(left, right));
    });
    it("tri wedge and hex block separate with normal pointing B away from A", () => {
        const wedge = new WorldProp(-2, 0, "tri_wedge", 0);
        const hex = new WorldProp(8, 0, "hex_block", 0);
        const info = separatePairUntilClear(wedge, hex);
        assert.ok(info);
        assert.ok(info.overlap > 0);
        const centerDx = hex.x - wedge.x;
        const centerDy = hex.y - wedge.y;
        assert.ok(dotXY(info.nx, info.ny, centerDx, centerDy) > 0);
        assert.ok(!pairStillOverlaps(wedge, hex));
    });
    it("stacked crates separate vertically with upward normal on upper body", () => {
        const bottom = new WorldProp(0, 0, "box", 0);
        const top = new WorldProp(0, 10, "box", 0);
        const info = separatePairUntilClear(bottom, top);
        assert.ok(info);
        assert.ok(info.ny > 0.9);
        assert.ok(!pairStillOverlaps(bottom, top));
    });
    it("resolveKineticContactPass separates overlapping bar and crate", () => {
        const bar = new WorldProp(0, 0, "box", 0);
        applyPropBoxFootprint(bar, 8, 4);
        const box = new WorldProp(12, 0, "box", 0);
        box.vx = -20;
        assert.ok(pairStillOverlaps(bar, box));
        resolveContactUntilClear(createKineticTestTick([bar, box]));
        assert.ok(!slabPairStillOverlaps(bar, box));
    });
    it("circle-poly ball and tri wedge separate with normal toward polygon", () => {
        const ball = new WorldProp(0, 0, "ball", 0);
        setCirclePropRadius(ball, 7);
        const wedge = new WorldProp(10, 0, "tri_wedge", 0);
        const info = separatePairUntilClear(ball, wedge);
        assert.ok(info);
        assert.ok(info.overlap > 0);
        const centerDx = wedge.x - ball.x;
        assert.ok(dotXY(info.nx, info.ny, centerDx, 0) > 0);
        assert.ok(!pairStillOverlaps(ball, wedge));
    });
    it("approaching poly pair slows head-on approach and separates", () => {
        const a = new WorldProp(0, 0, "hex_block", 0);
        const b = new WorldProp(10, 0, "hex_block", 0);
        a.vx = 40;
        b.vx = -20;
        resolveContactUntilClear(createKineticTestTick([a, b]));
        assert.ok(!slabPairStillOverlaps(a, b));
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
        const collided = checkEntityPairCollision(left, right);
        assert.ok(collided);
        assert.equal(SAT_RESULT[8], 2);
    });
    it("three-crate stack settles without lateral drift", () => {
        const bottom = new WorldProp(0, 0, "box", 0);
        const middle = new WorldProp(0, 12, "box", 0);
        const top = new WorldProp(0, 24, "box", 0);
        const tick = createKineticTestTick([bottom, middle, top]);
        const pairs = gatherKineticContactPairs(tick);
        for (let pass = 0; pass < 10; pass++) resolveKineticContactPassWithPairs(tick, pairs);
        assert.ok(Math.abs(kineticDynamicSlab.x[bottom._physId]) < 0.5);
        assert.ok(Math.abs(kineticDynamicSlab.x[middle._physId]) < 0.5);
        assert.ok(Math.abs(kineticDynamicSlab.x[top._physId]) < 0.5);
    });
});
