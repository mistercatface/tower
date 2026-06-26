import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Entities/WorldProp.js";
import { fracturePropOnImpact, impactForceFromContact, splitFootprintIntoComponents, worldHitToPropLocal } from "../Libraries/Props/propFracture.js";
import { chunkCollisionPartsArea } from "../Libraries/Props/chunkFracture.js";
import { applyPropBoxFootprint } from "../Libraries/Props/propStrategy.js";
import { getEntityCollisionParts } from "../Libraries/Spatial/collision/SatCollision.js";

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

    it("applyPropBoxFootprint rebakes chunk grid for resized custom box", () => {
        const prop = new WorldProp(0, 0, "custom_box", 0);
        applyPropBoxFootprint(prop, 20, 10);
        assert.ok(prop.chunks.length > 1);
        assert.equal(prop.shape.vertices.length, 4);
    });

    it("chunk fracture collision parts match stored material area", () => {
        const prop = new WorldProp(0, 0, "crate", 0);
        applyPropBoxFootprint(prop, 16, 16);
        const fracture = fracturePropOnImpact(prop, 0, 0, 80);
        assert.ok(fracture);
        const parentParts = getEntityCollisionParts(prop);
        assert.ok(parentParts.length >= 1);
        assert.ok(Math.abs(chunkCollisionPartsArea(parentParts) - prop.footprintArea) < 1);
        for (const geom of fracture.debris) {
            assert.ok(geom.collisionParts.length >= 1);
            assert.ok(Math.abs(chunkCollisionPartsArea(geom.collisionParts) - geom.footprintArea) < 1);
        }
    });
});
