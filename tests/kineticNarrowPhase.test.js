import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Entities/WorldProp.js";
import { satCheckCollision, checkEntityPairCollision, circleCircleContact, entityFacing, SAT_RESULT } from "../Libraries/Physics/physics.js";
import { gatherKineticCandidatePairs, kineticPairBuffer } from "../Libraries/Physics/physics.js";
import { snapshotKineticBodySlab } from "../Libraries/Physics/physics.js";
import { KINETIC_PAIR_TIER, classifyKineticPairTier } from "../Libraries/Physics/physics.js";
import { resolveKineticContactPass } from "./harness/kineticContactHarness.js";
import { createKineticTestTick, mockKineticCircle, setupKineticTestFrame } from "./harness/kineticTickHarness.js";
import { setCirclePropRadius } from "../Libraries/Props/propScale.js";
function largeBall(x, y) {
    const prop = new WorldProp(x, y, "ball", 0);
    setCirclePropRadius(prop, 7);
    return prop;
}
describe("kinetic narrow phase tiers", () => {
    it("classifies ball pairs as circle-circle", () => {
        const a = new WorldProp(0, 0, "ball", 0);
        const b = largeBall(10, 0);
        assert.equal(classifyKineticPairTier(a, b), KINETIC_PAIR_TIER.CIRCLE_CIRCLE);
    });
    it("classifies crate pairs as poly-poly", () => {
        const a = new WorldProp(0, 0, "crate", 0);
        const b = new WorldProp(10, 0, "crate", 0);
        assert.equal(classifyKineticPairTier(a, b), KINETIC_PAIR_TIER.POLY_POLY);
    });
    it("classifies ball against wedge as circle-poly", () => {
        const ball = largeBall(0, 0);
        const wedge = new WorldProp(10, 0, "tri_wedge", 0);
        assert.equal(classifyKineticPairTier(ball, wedge), KINETIC_PAIR_TIER.CIRCLE_POLY);
    });
    it("classifies multi-part fracture debris as compound", () => {
        const crate = new WorldProp(0, 0, "crate", 0);
        crate.collisionParts = [crate.shape, crate.shape];
        const ball = new WorldProp(10, 0, "ball", 0);
        assert.equal(classifyKineticPairTier(crate, ball), KINETIC_PAIR_TIER.COMPOUND);
    });
    it("circle-circle fast contact matches SAT dispatch", () => {
        const a = mockKineticCircle(0, 0, 10);
        const b = mockKineticCircle(15, 0, 10);
        const fastCollided = circleCircleContact(a.x, a.y, a.shape, b.x, b.y, b.shape);
        const fastRes = new Float32Array(SAT_RESULT);
        const satCollided = satCheckCollision(a.x, a.y, entityFacing(a), a.shape, b.x, b.y, entityFacing(b), b.shape);
        assert.equal(fastCollided, satCollided);
        if (fastCollided) {
            assert.deepEqual(fastRes, SAT_RESULT);
        }
    });
    it("pair gather stamps circle-circle tier on overlapping movers", () => {
        const a = mockKineticCircle(0, 0, 10, 40, 0);
        const b = mockKineticCircle(15, 0, 10, -10, 0);
        const frame = setupKineticTestFrame([a, b]);
        snapshotKineticBodySlab(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, kineticPairBuffer);
        assert.equal(kineticPairBuffer.count, 1);
        assert.equal(kineticPairBuffer.static.tier[0], KINETIC_PAIR_TIER.CIRCLE_CIRCLE);
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
        assert.ok(satCheckCollision(ball.x, ball.y, entityFacing(ball), ball.shape, wedge.x, wedge.y, entityFacing(wedge), wedge.shape));
        const tick = createKineticTestTick([ball, wedge]);
        resolveKineticContactPass(tick);
        assert.ok(!satCheckCollision(ball.x, ball.y, entityFacing(ball), ball.shape, wedge.x, wedge.y, entityFacing(wedge), wedge.shape));
    });
    it("contact pass still separates poly-poly pairs", () => {
        const left = new WorldProp(0, 0, "crate", 0);
        const right = new WorldProp(10, 0, "crate", 0);
        right.vx = -20;
        assert.ok(checkEntityPairCollision(left, right));
        resolveKineticContactPass(createKineticTestTick([left, right]));
        assert.ok(!checkEntityPairCollision(left, right));
    });
});
