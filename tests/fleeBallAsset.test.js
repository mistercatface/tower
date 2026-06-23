import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { worldPropAssets } from "../Libraries/Props/PropCatalog.js";
import { WorldProp } from "../Entities/WorldProp.js";
describe("flee_ball asset", () => {
    it("is a plain rolling sphere with chain support", () => {
        const asset = worldPropAssets["flee_ball"];
        assert.equal(asset.id, "flee_ball");
        assert.equal(asset.primitive, "sphere");
        assert.equal(asset.draw, undefined);
        assert.equal(asset.physics.rolls, true);
        assert.equal(asset.physics.canChain, true);
        assert.equal(asset.physics.getCustomSpriteCacheKey, undefined);
        const prop = new WorldProp(0, 0, "flee_ball");
        assert.equal(prop.shape.type, "Circle");
        assert.equal(prop.collisionParts, undefined);
    });
});
