import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assetHasTintableColors, resolveVisualOverrideColorTree, resolveVisualOverridePanels, setPropVisualTint, visualOverrideCacheKey, PUZZLE_TEMPLATE_BALL_TINTS } from "../Libraries/Color/visualOverride.js";
import propCatalog from "../Assets/props/index.js";
describe("Color visualOverride", () => {
    it("shifts sphere panel hues toward a target tint hex", () => {
        const base = propCatalog["ball"].visuals.panels;
        const tinted = resolveVisualOverridePanels({ visualOverride: { tint: "#00ff00" } }, base);
        assert.equal(tinted.length, base.length);
        assert.notDeepEqual(tinted, base);
        assert.notEqual(tinted[0].toLowerCase(), base[0].toLowerCase());
    });
    it("colorizes neutral grey panels instead of hue-shifting them", () => {
        const base = propCatalog["ball"].visuals.panels;
        const red = resolveVisualOverridePanels({ visualOverride: { tint: "#ff0000" } }, base);
        const blue = resolveVisualOverridePanels({ visualOverride: { tint: "#0000ff" } }, base);
        assert.notEqual(red[0].toLowerCase(), blue[0].toLowerCase());
        assert.notEqual(red[0].toLowerCase(), base[0].toLowerCase());
    });
    it("shifts flat and nested extruded color trees", () => {
        const crateColors = propCatalog["crate"].visuals.colors;
        const tinted = resolveVisualOverrideColorTree({ visualOverride: { tint: "#00aa00" } }, crateColors);
        assert.notEqual(tinted.side, crateColors.side);
        assert.equal(tinted.plankTs, crateColors.plankTs);
    });
    it("assetHasTintableColors covers spheres, crates, and goal star", () => {
        assert.equal(assetHasTintableColors(propCatalog["ball"]), true);
        assert.equal(assetHasTintableColors(propCatalog["crate"]), true);
        assert.equal(assetHasTintableColors(propCatalog["button_floor"]), false);
    });
    it("resolveVisualOverridePanels uses asset panels when prop has no override", () => {
        const base = propCatalog["ball"].visuals.panels;
        const prop = {};
        assert.deepEqual(resolveVisualOverridePanels(prop, base), base);
    });
    it("ball visuals avoid near-white panels that overpower tint", () => {
        const visuals = propCatalog["ball"].visuals;
        assert.ok(visuals.panels.every((hex) => Number.parseInt(hex.slice(1, 3), 16) < 0xee));
    });
    it("visualOverrideCacheKey keys tinted props by hex", () => {
        const prop = {};
        assert.equal(visualOverrideCacheKey(prop), "");
        setPropVisualTint(prop, "#2a2a2a");
        assert.equal(visualOverrideCacheKey(prop), "t2a2a2a");
        setPropVisualTint(prop, "#ff0000");
        assert.equal(visualOverrideCacheKey(prop), "tff0000");
    });
    it("puzzle template ball tints are distinct hex values", () => {
        assert.notEqual(PUZZLE_TEMPLATE_BALL_TINTS.roomA.toLowerCase(), PUZZLE_TEMPLATE_BALL_TINTS.roomB.toLowerCase());
    });
});
