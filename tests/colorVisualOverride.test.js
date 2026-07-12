import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveVisualOverrideColorTree, setPropVisualTint, visualOverrideCacheKey } from "../Libraries/Color/visualOverride.js";
import propCatalog from "../Assets/props/index.js";
import { WALL_CHUNK_FALLBACK_COLORS, SPHERE_PENDING_FILL } from "../Libraries/Render/render.js";

describe("Color visualOverride", () => {
    it("shifts flat and nested extruded color trees", () => {
        const tinted = resolveVisualOverrideColorTree({ visualOverride: { tint: "#00aa00" } }, WALL_CHUNK_FALLBACK_COLORS);
        assert.notEqual(tinted.side, WALL_CHUNK_FALLBACK_COLORS.side);
        assert.equal(tinted.top != null, true);
    });
    it("ball asset has no coat visuals; sphere draw uses shared pending fill", () => {
        assert.equal(propCatalog["ball"].visuals, undefined);
        assert.equal(SPHERE_PENDING_FILL, "#9A9A9A");
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
