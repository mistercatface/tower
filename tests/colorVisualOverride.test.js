import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assetHasTintableColors, resolveVisualOverrideColorTree, resolveVisualOverridePanels, setPropVisualTint, visualOverrideCacheKey, PUZZLE_TEMPLATE_BALL_TINTS } from "../Libraries/Color/visualOverride.js";
import propCatalog from "../Assets/props/index.js";

const SAMPLE_PANELS = ["#9A9A9A", "#7F7F7F", "#AFAFAF", "#666666"];

describe("Color visualOverride", () => {
    it("shifts panel hues toward a target tint hex", () => {
        const tinted = resolveVisualOverridePanels({ visualOverride: { tint: "#00ff00" } }, SAMPLE_PANELS);
        assert.equal(tinted.length, SAMPLE_PANELS.length);
        assert.notDeepEqual(tinted, SAMPLE_PANELS);
        assert.notEqual(tinted[0].toLowerCase(), SAMPLE_PANELS[0].toLowerCase());
    });
    it("colorizes neutral grey panels instead of hue-shifting them", () => {
        const red = resolveVisualOverridePanels({ visualOverride: { tint: "#ff0000" } }, SAMPLE_PANELS);
        const blue = resolveVisualOverridePanels({ visualOverride: { tint: "#0000ff" } }, SAMPLE_PANELS);
        assert.notEqual(red[0].toLowerCase(), blue[0].toLowerCase());
        assert.notEqual(red[0].toLowerCase(), SAMPLE_PANELS[0].toLowerCase());
    });
    it("shifts flat and nested extruded color trees", () => {
        const crateColors = propCatalog["box"].visuals.colors;
        const tinted = resolveVisualOverrideColorTree({ visualOverride: { tint: "#00aa00" } }, crateColors);
        assert.notEqual(tinted.side, crateColors.side);
        assert.equal(tinted.top != null, true);
    });
    it("assetHasTintableColors covers boxes with colors, not profile spheres", () => {
        assert.equal(assetHasTintableColors(propCatalog["ball"]), false);
        assert.equal(assetHasTintableColors(propCatalog["box"]), true);
        assert.equal(assetHasTintableColors(propCatalog["floor_belt"]), false);
    });
    it("resolveVisualOverridePanels uses asset panels when prop has no override", () => {
        const prop = {};
        assert.deepEqual(resolveVisualOverridePanels(prop, SAMPLE_PANELS), SAMPLE_PANELS);
    });
    it("sphere visuals use pendingFill instead of coat panels", () => {
        const visuals = propCatalog["ball"].visuals;
        assert.equal(visuals.panels, undefined);
        assert.equal(typeof visuals.pendingFill, "string");
        assert.ok(Number.parseInt(visuals.pendingFill.slice(1, 3), 16) < 0xee);
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
