import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { applyPropBoxFootprint } from "../Libraries/Props/propStrategy.js";
import { applyShardGeometryToProp, canFracturePropSplit, fracturePropOnImpact } from "../Libraries/Props/propFracture.js";
import { shatterGlassFootprint, shatterGlassPolygon } from "../Libraries/Props/glassFracture.js";
import { getPropAsset } from "../Libraries/Props/PropCatalog.js";
loadPropAssets();
describe("glass fracture", () => {
    it("glass_pane asset uses glass fracture mode and resizable spawn", () => {
        const asset = getPropAsset("glass_pane");
        assert.equal(asset.physics.fractureMode, "glass");
        assert.ok(asset.sandbox.resizableBox);
    });
    it("glass pane init has no poxel tessellation", () => {
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        assert.equal(prop.poxels, undefined);
        assert.equal(prop.shape.vertices.length, 4);
        assert.ok(canFracturePropSplit(prop));
    });
    it("shatterGlassFootprint produces radial shards without poxels", () => {
        const shards = shatterGlassFootprint(12, 8, 2, -1, 20);
        assert.ok(shards.length >= 8);
        for (const shard of shards) {
            assert.ok(shard.footprintArea > 0);
            assert.ok(shard.footprintVertices.length >= 6);
            assert.ok(shard.centroid);
        }
    });
    it("fracturePropOnImpact returns all shards for glass and no parent geometry", () => {
        const prop = new WorldProp(50, 50, "glass_pane", 0);
        applyPropBoxFootprint(prop, 16, 10);
        const fracture = fracturePropOnImpact(prop, 50, 50, 25);
        assert.ok(fracture);
        assert.ok(fracture.debris.length >= 8);
        assert.ok(fracture.impactLocal);
        assert.equal(prop.poxels, undefined);
    });
    it("glass shard fractures again on its actual polygon footprint", () => {
        const shards = shatterGlassFootprint(12, 8, 0, 0, 30);
        const big = shards.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        applyShardGeometryToProp(prop, big);
        assert.ok(canFracturePropSplit(prop));
        const fracture = fracturePropOnImpact(prop, 0, 0, 25);
        assert.ok(fracture);
        assert.ok(fracture.debris.length >= 2);
        for (const piece of fracture.debris) assert.ok(piece.footprintArea < big.footprintArea);
    });
    it("shatterGlassPolygon splits non-rect shard geometry", () => {
        const parentShards = shatterGlassFootprint(10, 6, 1, 0, 25);
        const shard = parentShards.reduce((a, b) => (a.footprintArea > b.footprintArea ? a : b));
        const again = shatterGlassPolygon(shard.footprintVertices, 0, 0, 25);
        assert.ok(again.length >= 2);
    });
    it("tiny glass pieces stop splitting at min size", () => {
        const prop = new WorldProp(0, 0, "glass_pane", 0);
        applyPropBoxFootprint(prop, 2, 2);
        assert.equal(canFracturePropSplit(prop), false);
    });
});
