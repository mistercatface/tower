import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { bakePoxelOutline, localBoxOutline } from "../Libraries/Props/poxelFracture.js";
import {
    fracturePropOnImpact,
    impactForceFromContact,
    splitFootprintIntoComponents,
    worldHitToPropLocal,
} from "../Libraries/Props/propFracture.js";
import { applyPropBoxFootprint } from "../Libraries/Props/propStrategy.js";

loadPropAssets();

describe("prop impact fracture", () => {
    it("worldHitToPropLocal maps world hits into prop space", () => {
        const prop = { x: 100, y: 200, facing: Math.PI / 2 };
        const local = worldHitToPropLocal(prop, 100, 210);
        assert.ok(Math.abs(local.x - 10) < 1e-6);
        assert.ok(Math.abs(local.y) < 1e-6);
    });

    it("impactForceFromContact scales with relative speed", () => {
        assert.ok(impactForceFromContact(200) > impactForceFromContact(50));
    });

    it("splitFootprintIntoComponents localizes breaks away from center hit", () => {
        const prop = new WorldProp(0, 0, "crate", 0);
        const center = splitFootprintIntoComponents(prop, 0, 0, 80, false);
        const edge = splitFootprintIntoComponents(prop, 7, 0, 80, false);
        assert.ok(center.length > 1);
        assert.ok(edge.length >= 1);
        assert.ok(center.length >= edge.length);
    });

    it("fracturePropOnImpact keeps largest piece on parent and returns debris", () => {
        const prop = new WorldProp(100, 200, "crate", 0);
        applyPropBoxFootprint(prop, 12, 12);
        const initialChunks = prop.chunks.length;
        const fracture = fracturePropOnImpact(prop, 100, 200, 80);
        assert.ok(fracture);
        assert.ok(prop.chunks.length < initialChunks);
        assert.ok(fracture.debris.length > 0);
        assert.ok(prop.footprintArea > 0);
        for (const geom of fracture.debris) assert.ok(geom.footprintArea <= prop.footprintArea);
    });

    it("bigger footprints bake more poxels", () => {
        const small = bakePoxelOutline(localBoxOutline(8, 8));
        const large = bakePoxelOutline(localBoxOutline(24, 16));
        assert.ok(large.poxels.length > small.poxels.length);
    });

    it("applyPropBoxFootprint rebakes chunk grid for resized custom box", () => {
        const prop = new WorldProp(0, 0, "custom_box", 0);
        applyPropBoxFootprint(prop, 20, 10);
        assert.ok(prop.chunks.length > 1);
        assert.equal(prop.poxels, undefined);
        assert.equal(prop.shape.vertices.length, 4);
    });
});
