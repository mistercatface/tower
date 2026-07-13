import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp, setCirclePropRadius } from "../Libraries/Props/props.js";
import { polygonIsConvex, earClipConvexPartsInto, regularStarFootprint, polygonSignedArea2D } from "../Libraries/Math/math.js";
import { kineticFootprintArea } from "../Libraries/Physics/physics.js";
import { FractureEngine } from "../Libraries/Physics/fracture.js";
import { ENGINE_F32, F_OUT_DEBRIS_COUNT, F_OUT_REMNANT } from "../Core/engineMemory.js";
import { createKineticTestTick, assignPhysIdWithPose, snapshotKineticBodySlab } from "./harness/kineticTickHarness.js";
import { checkPairAtSlabPose, resolveKineticContactPass } from "./harness/kineticContactHarness.js";
import { createFractureWorld } from "./harness/fractureHarness.js";
import { addWorldPropsToState } from "../GameState/EntityRegistry.js";

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
        assignPhysIdWithPose(star, 0);
        assignPhysIdWithPose(ball, 1);
        snapshotKineticBodySlab([0, 1], 2);
        assert.ok(checkPairAtSlabPose(star, ball));
        const tick = createKineticTestTick([star, ball]);
        let maxContacts = 0;
        for (let pass = 0; pass < 12; pass++) {
            const contacts = resolveKineticContactPass(tick);
            maxContacts = Math.max(maxContacts, contacts.count);
            if (!checkPairAtSlabPose(star, ball)) break;
        }
        assert.ok(maxContacts >= 1);
        assert.equal(checkPairAtSlabPose(star, ball), false);
    });

    it("star tip fracture removes parent and spawns only debris", () => {
        const world = createFractureWorld();
        const star = new WorldProp(0, 0, "star_block", 0);
        star.fractureEnabled = true;
        assignPhysIdWithPose(star, 0);
        addWorldPropsToState(world, [star]);
        const partsBefore = star.collisionParts.length;
        assert.ok(FractureEngine.fracturePropOnImpact(star, 12, 0, 40, world.fractureEngine));
        assert.equal(ENGINE_F32[F_OUT_REMNANT], 0);
        assert.ok(ENGINE_F32[F_OUT_DEBRIS_COUNT] >= partsBefore);
        const spatialFrame = world.spatialFrame;
        const shards = FractureEngine.commitFractureResult(world, star, spatialFrame);
        assert.ok(shards.length >= partsBefore);
        assert.ok(shards.every((s) => s.isKineticDebris));
        assert.equal(world.worldProps.includes(star), false);
        assert.ok(!world.worldProps.some((p) => p === star));
    });
});
