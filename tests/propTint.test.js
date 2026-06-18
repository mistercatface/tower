import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import {
    assetHasTintableColors,
    hexToPropTintHue,
    isPropTintable,
    propTintCacheKey,
    propTintHueToHex,
    resolvePropTintedColorTree,
    resolveTintedSpherePanels,
    setPropTint,
} from "../Libraries/Props/propTint.js";
import { getPropAsset } from "../Libraries/Props/PropCatalog.js";

loadPropAssets();

describe("propTint", () => {
    it("shifts sphere panel hues toward a target tint", () => {
        const base = getPropAsset("blue_ball").visuals.panels;
        const tinted = resolveTintedSpherePanels({ propTint: 120 }, base);
        assert.equal(tinted.length, base.length);
        assert.notDeepEqual(tinted, base);
    });

    it("shifts flat and nested extruded color trees", () => {
        const crateColors = getPropAsset("crate").visuals.colors;
        const tinted = resolvePropTintedColorTree({ propTint: 90 }, crateColors);
        assert.notEqual(tinted.side, crateColors.side);
        assert.equal(tinted.plankTs, crateColors.plankTs);
    });

    it("isPropTintable covers spheres, crates, and goal star", () => {
        assert.equal(isPropTintable(getPropAsset("blue_ball")), true);
        assert.equal(isPropTintable(getPropAsset("crate")), true);
        assert.equal(isPropTintable(getPropAsset("goal_orb")), true);
        assert.equal(assetHasTintableColors(getPropAsset("button_floor")), false);
    });

    it("resolveTintedSpherePanels uses asset panels when prop has no tint", () => {
        const base = getPropAsset("blue_ball").visuals.panels;
        const prop = {};
        assert.deepEqual(resolveTintedSpherePanels(prop, base), base);
    });

    it("propTintCacheKey buckets tinted props", () => {
        const prop = {};
        assert.equal(propTintCacheKey(prop), "");
        setPropTint(prop, 42.4);
        assert.equal(propTintCacheKey(prop), "t42");
    });

    it("round-trips picker hex through hue", () => {
        const hue = hexToPropTintHue("#ff8800");
        const hex = propTintHueToHex(hue);
        assert.match(hex, /^#[0-9a-f]{6}$/i);
    });
});
