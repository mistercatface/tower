import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { getPropAsset } from "../Libraries/Props/PropCatalog.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { setCirclePropRadius } from "../Libraries/Props/propScale.js";
import { buildFleeBallWedgeLocalVerts, getFleeBallSpriteCacheKey } from "../Libraries/Render/createFleeBallDraw.js";
import { quantizeAngleIndex } from "../Libraries/Canvas/viewQuantize.js";

loadPropAssets();

describe("flee_ball asset", () => {
    it("registers circle physics with rim wedge draw and turret cache buckets", () => {
        const asset = getPropAsset("flee_ball");
        assert.equal(asset.id, "flee_ball");
        assert.equal(typeof asset.draw, "function");
        assert.equal(asset.physics.rolls, true);
        assert.equal(asset.physics.canChain, true);
        const prop = new WorldProp(0, 0, "flee_ball");
        assert.equal(prop.shape.type, "Circle");
        assert.equal(prop.collisionParts, undefined);
        setCirclePropRadius(prop, 2);
        prop.turretFacing = 0;
        const key0 = getFleeBallSpriteCacheKey(prop);
        prop.turretFacing = Math.PI / 2;
        const key90 = getFleeBallSpriteCacheKey(prop);
        assert.notEqual(key0, key90);
        assert.equal(key0, `r8_h${quantizeAngleIndex(0, 16)}`);
        assert.equal(key90, `r8_h${quantizeAngleIndex(Math.PI / 2, 16)}`);
    });

    it("places wedge verts on the ball rim in local space", () => {
        const verts = buildFleeBallWedgeLocalVerts(2);
        assert.equal(verts.length, 3);
        let maxX = verts[0].x;
        for (let i = 1; i < verts.length; i++) if (verts[i].x > maxX) maxX = verts[i].x;
        assert.ok(maxX > 2);
        assert.ok(maxX < 5);
    });
});
