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
import { getPropAsset } from "../Libraries/Props/PropCatalog.js";
import { PUZZLE_TEMPLATE_BALL_TINTS, BALL_TINT_PRESETS } from "../Libraries/Color/tintPresets.js";

loadPropAssets();

describe("Color visualOverride", () => {
    it("shifts sphere panel hues toward a target tint hex", () => {
        const base = getPropAsset("ball").visuals.panels;
        const tinted = resolveVisualOverridePanels({ visualOverride: { tint: "#00ff00" } }, base);
        assert.equal(tinted.length, base.length);
        assert.notDeepEqual(tinted, base);
        assert.notEqual(tinted[0].toLowerCase(), base[0].toLowerCase());
    });

    it("colorizes neutral grey panels instead of hue-shifting them", () => {
        const base = getPropAsset("ball").visuals.panels;
        const red = resolveVisualOverridePanels({ visualOverride: { tint: "#ff0000" } }, base);
        const blue = resolveVisualOverridePanels({ visualOverride: { tint: "#0000ff" } }, base);
        assert.notEqual(red[0].toLowerCase(), blue[0].toLowerCase());
        assert.notEqual(red[0].toLowerCase(), base[0].toLowerCase());
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

    it("visualOverrideCacheKey keys tinted props by hex", () => {
        const prop = {};
        assert.equal(visualOverrideCacheKey(prop), "");
        setPropVisualTint(prop, "#2a2a2a");
        assert.equal(visualOverrideCacheKey(prop), "t2a2a2a");
        setPropVisualTint(prop, "#ff0000");
        assert.equal(visualOverrideCacheKey(prop), "tff0000");
    });

    it("ball tint presets cover puzzle template colors", () => {
        const hexes = new Set(BALL_TINT_PRESETS.map((preset) => preset.hex.toLowerCase()));
        assert.ok(hexes.has(PUZZLE_TEMPLATE_BALL_TINTS.roomA.toLowerCase()));
        assert.ok(hexes.has(PUZZLE_TEMPLATE_BALL_TINTS.roomB.toLowerCase()));
    });
});
