import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveVisualOverrideColorTree, setPropVisualTint, visualOverrideCacheKey } from "../Libraries/Color/visualOverride.js";
import propCatalog from "../Assets/props/index.js";
import { NEUTRAL_SPHERE_PENDING_FILL } from "../Assets/props/shared/neutralCoats.js";

describe("Color visualOverride", () => {
    it("shifts flat and nested extruded color trees", () => {
        const crateColors = propCatalog["box"].visuals.colors;
        const tinted = resolveVisualOverrideColorTree({ visualOverride: { tint: "#00aa00" } }, crateColors);
        assert.notEqual(tinted.side, crateColors.side);
        assert.equal(tinted.top != null, true);
    });
    it("sphere visuals use pendingFill instead of coat panels", () => {
        const visuals = propCatalog["ball"].visuals;
        assert.equal(visuals.panels, undefined);
        assert.equal(visuals.pendingFill, NEUTRAL_SPHERE_PENDING_FILL);
    });
    it("visualOverrideCacheKey keys tinted props by hex", () => {
        const prop = {};
        assert.equal(visualOverrideCacheKey(prop), "");
        setPropVisualTint(prop, "#2a2a2a");
        assert.equal(visualOverrideCacheKey(prop), "t2a2a2a");
        setPropVisualTint(prop, "#ff0000");
        assert.equal(visualOverrideCacheKey(prop), "tff0000");
    });
});
