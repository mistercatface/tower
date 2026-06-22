import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import {
    applyFleeHornWedgeScale,
    buildFleeHornWedgeFootprint,
    fleeHornMountOffsetFromBallCenter,
    fleeHornWedgeWorldHeight,
    FLEE_HORN_WEDGE_HALF_WIDTH_RATIO,
    FLEE_HORN_WEDGE_LENGTH_RATIO,
    FLEE_HORN_WEDGE_MOUNT_GAP_RATIO,
} from "../Libraries/Props/fleeHornWedge.js";

loadPropAssets();

describe("flee horn wedge", () => {
    it("builds +x tip footprint scaled to body radius", () => {
        const bodyRadius = 2;
        const verts = buildFleeHornWedgeFootprint(bodyRadius);
        const halfLength = bodyRadius * FLEE_HORN_WEDGE_LENGTH_RATIO * 0.5;
        const halfWidth = bodyRadius * FLEE_HORN_WEDGE_HALF_WIDTH_RATIO;
        assert.equal(verts.length, 3);
        assert.ok(Math.abs(verts[0].y) < 1e-6);
        assert.equal(verts[0].x, halfLength);
        assert.equal(verts[1].x, -halfLength);
        assert.equal(verts[2].x, -halfLength);
        assert.equal(verts[1].y, -halfWidth);
        assert.equal(verts[2].y, halfWidth);
    });

    it("matches old rim wedge proportions at radius 2", () => {
        const bodyRadius = 2;
        const mountX = bodyRadius + bodyRadius * FLEE_HORN_WEDGE_MOUNT_GAP_RATIO;
        const length = bodyRadius * FLEE_HORN_WEDGE_LENGTH_RATIO;
        const halfW = bodyRadius * FLEE_HORN_WEDGE_HALF_WIDTH_RATIO;
        const rimTipX = mountX + length;
        const verts = buildFleeHornWedgeFootprint(bodyRadius);
        assert.equal(verts[0].x, length * 0.5);
        assert.equal(verts[1].x, -length * 0.5);
        assert.ok(Math.abs(verts[1].y + halfW) < 1e-6);
        assert.ok(Math.abs(rimTipX - (mountX + verts[0].x - verts[1].x)) < 1e-6);
    });

    it("scales flee_wedge prop footprint and extrusion height", () => {
        const prop = new WorldProp(0, 0, "flee_wedge", 0);
        applyFleeHornWedgeScale(prop, 2);
        const verts = prop.shape.vertices;
        assert.ok(verts[0].x > 0);
        assert.ok(verts[0].x < 4);
        assert.ok(Math.abs(verts[1].y + verts[2].y) < 1e-6);
        assert.ok(Math.abs(prop.height - fleeHornWedgeWorldHeight(2)) < 1e-6);
        assert.equal(prop._fleeHornBodyRadius, 2);
        applyFleeHornWedgeScale(prop, 4);
        assert.ok(prop.shape.vertices[0].x > verts[0].x);
        assert.ok(prop.height > fleeHornWedgeWorldHeight(2));
    });

    it("exposes rim mount offset for ball pairing", () => {
        const bodyRadius = 2;
        const halfLength = bodyRadius * FLEE_HORN_WEDGE_LENGTH_RATIO * 0.5;
        const expected = bodyRadius + bodyRadius * FLEE_HORN_WEDGE_MOUNT_GAP_RATIO + halfLength;
        assert.equal(fleeHornMountOffsetFromBallCenter(bodyRadius), expected);
    });
});
