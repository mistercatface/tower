import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { SatCollision, checkEntityPairCollision, circleCircleContact } from "../Libraries/Spatial/collision/SatCollision.js";
import { gatherKineticCandidatePairs, kineticPairBuffer } from "../Libraries/Spatial/collision/kineticPairStream.js";
import { snapshotActiveBroadphaseBounds } from "../Libraries/Spatial/collision/entityBroadphase.js";
import { KINETIC_PAIR_TIER, classifyKineticPairTier } from "../Libraries/Spatial/collision/kineticNarrowPhase.js";
import { resolveKineticContactPass } from "./harness/kineticContactHarness.js";
import { createKineticTestTick, mockKineticCircle, setupKineticTestFrame } from "./harness/kineticTickHarness.js";
import { setCirclePropRadius } from "../Libraries/Props/propScale.js";
loadPropAssets();
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
        crate.collisionParts = [crate.getShape(), crate.getShape()];
        const ball = new WorldProp(10, 0, "ball", 0);
        assert.equal(classifyKineticPairTier(crate, ball), KINETIC_PAIR_TIER.COMPOUND);
    });
    it("circle-circle fast contact matches SAT dispatch", () => {
        const a = mockKineticCircle(0, 0, 10);
        const b = mockKineticCircle(15, 0, 10);
        const fast = circleCircleContact(a, a.getShape(), b, b.getShape());
        const sat = SatCollision.checkCollision(a, a.getShape(), b, b.getShape());
        assert.deepEqual(fast, sat);
    });
    it("pair gather stamps circle-circle tier on overlapping movers", () => {
        const a = mockKineticCircle(0, 0, 10, 40, 0);
        const b = mockKineticCircle(15, 0, 10, -10, 0);
        const frame = setupKineticTestFrame([a, b]);
        snapshotActiveBroadphaseBounds(frame._activeKineticBodies);
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
        assert.ok(SatCollision.checkCollision(ball, ball.getShape(), wedge, wedge.getShape()));
        const tick = createKineticTestTick([ball, wedge]);
        resolveKineticContactPass(tick);
        assert.ok(!SatCollision.checkCollision(ball, ball.getShape(), wedge, wedge.getShape()));
    });
    it("contact pass still separates poly-poly pairs", () => {
        const left = new WorldProp(0, 0, "crate", 0);
        const right = new WorldProp(10, 0, "crate", 0);
        right.vx = -20;
        assert.ok(checkEntityPairCollision(left, right));
        resolveKineticContactPass(createKineticTestTick([left, right]));
        assert.equal(checkEntityPairCollision(left, right), null);
    });
});
