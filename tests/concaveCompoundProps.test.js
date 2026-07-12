import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp, setCirclePropRadius } from "../Libraries/Props/props.js";
import { polygonIsConvex, earClipConvexPartsInto, regularStarFootprint, polygonSignedArea2D } from "../Libraries/Math/math.js";
import { classifyKineticPairTier, gatherKineticContactPairs, resolveKineticContactPassWithPairs, kineticFootprintArea } from "../Libraries/Physics/physics.js";
import { KINETIC_PAIR_COMPOUND } from "../Core/engineEnums.js";
import { createKineticTestTick } from "./harness/kineticTickHarness.js";
import { checkPairAtSlabPose } from "./harness/kineticContactHarness.js";

describe("concave footprint compounds", () => {
    it("ear-clips a star outline into convex triangles", () => {
        const verts = regularStarFootprint(5, 14, 6);
        assert.equal(polygonIsConvex(verts), false);
        const parts = [];
        earClipConvexPartsInto(parts, verts);
        assert.equal(parts.length, 8);
        for (const tri of parts) {
            assert.equal(tri.length, 6);
            assert.equal(polygonIsConvex(tri), true);
        }
        let area = 0;
        for (const tri of parts) area += Math.abs(polygonSignedArea2D(tri));
        assert.ok(Math.abs(area - Math.abs(polygonSignedArea2D(verts))) < 1e-6);
    });

    it("cross_pinwheel / star / gear all auto-decompose the same way", () => {
        for (const type of ["cross_pinwheel", "star_block", "gear_block"]) {
            const prop = new WorldProp(0, 0, type, 0);
            assert.ok(prop.collisionParts.length > 1, `${type} should be compound`);
            assert.ok(prop.drawOutline instanceof Float32Array, `${type} should keep silhouette outline`);
            assert.equal(prop.drawOutline.length, prop.strategy.localFootprint.length);
            assert.ok(Math.abs(kineticFootprintArea(prop) - Math.abs(polygonSignedArea2D(prop.strategy.localFootprint))) < 1e-6);
        }
    });

    it("hex stays a single convex shape", () => {
        const hex = new WorldProp(0, 0, "hex_block", 0);
        assert.equal(hex.collisionParts, undefined);
        assert.equal(hex.drawOutline, undefined);
        assert.equal(polygonIsConvex(hex.shape.vertices), true);
    });

    it("ball against star notch separates via compound contacts", () => {
        const star = new WorldProp(0, 0, "star_block", 0);
        const ball = new WorldProp(0, 9, "ball", 0);
        setCirclePropRadius(ball, 3);
        ball.vy = -20;
        assert.equal(classifyKineticPairTier(star, ball), KINETIC_PAIR_COMPOUND);
        const tick = createKineticTestTick([star, ball]);
        const pairs = gatherKineticContactPairs(tick);
        assert.ok(pairs.count >= 1);
        let maxContacts = 0;
        for (let pass = 0; pass < 12; pass++) {
            const contacts = resolveKineticContactPassWithPairs(tick, pairs);
            maxContacts = Math.max(maxContacts, contacts.count);
            if (!checkPairAtSlabPose(star, ball)) break;
        }
        assert.ok(maxContacts >= 1);
        assert.equal(checkPairAtSlabPose(star, ball), false);
    });
});
