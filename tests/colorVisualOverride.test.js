import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import {
    assetHasTintableColors,
    resolveVisualOverrideColorTree,
    resolveVisualOverridePanels,
    setPropVisualTint,
    visualOverrideCacheKey,
} from "../Libraries/Color/visualOverride.js";
import { hexToHue } from "../Libraries/Color/hex.js";
import { getPropAsset } from "../Libraries/Props/PropCatalog.js";

loadPropAssets();

describe("Color visualOverride", () => {
    it("shifts sphere panel hues toward a target tint hex", () => {
        const base = getPropAsset("ball").visuals.panels;
        const tinted = resolveVisualOverridePanels({ visualOverride: { tint: "#00ff00" } }, base);
        assert.equal(tinted.length, base.length);
        assert.notDeepEqual(tinted, base);
    });

    it("shifts flat and nested extruded color trees", () => {
        const crateColors = getPropAsset("crate").visuals.colors;
        const tinted = resolveVisualOverrideColorTree({ visualOverride: { tint: "#00aa00" } }, crateColors);
        assert.notEqual(tinted.side, crateColors.side);
        assert.equal(tinted.plankTs, crateColors.plankTs);
    });

    it("assetHasTintableColors covers spheres, crates, and goal star", () => {
        assert.equal(assetHasTintableColors(getPropAsset("ball")), true);
        assert.equal(assetHasTintableColors(getPropAsset("crate")), true);
        assert.equal(assetHasTintableColors(getPropAsset("goal_orb")), true);
        assert.equal(assetHasTintableColors(getPropAsset("button_floor")), false);
    });

    it("resolveVisualOverridePanels uses asset panels when prop has no override", () => {
        const base = getPropAsset("ball").visuals.panels;
        const prop = {};
        assert.deepEqual(resolveVisualOverridePanels(prop, base), base);
    });

    it("visualOverrideCacheKey buckets tinted props", () => {
        const prop = {};
        assert.equal(visualOverrideCacheKey(prop), "");
        setPropVisualTint(prop, "#2a2a2a");
        assert.equal(visualOverrideCacheKey(prop), `t${Math.round(hexToHue("#2a2a2a"))}`);
    });

    it("blue_ball alias ships with a default tint on spawn", () => {
        assert.equal(getPropAsset("blue_ball").defaultVisualOverride.tint, "#42A5F5");
        assert.equal(getPropAsset("blue_ball").visuals.panels, getPropAsset("ball").visuals.panels);
    });
});
