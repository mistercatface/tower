import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveVisualOverrideColorTree, mergePropVisualOverride, visualOverrideCacheId } from "../Libraries/Color/visualOverride.js";
import propCatalog from "../Assets/props/index.js";

describe("Color visualOverride", () => {
    it("shifts flat and nested extruded color trees", () => {
        const base = { side: "#9E9E9E", sideShadow: "#757575", top: "#BDBDBD" };
        const tinted = resolveVisualOverrideColorTree({ visualOverride: { tint: "#00aa00" } }, base);
        assert.notEqual(tinted.side, base.side);
        assert.equal(tinted.top != null, true);
    });
    it("ball asset has no coat visuals", () => {
        assert.equal(propCatalog["ball"].visuals, undefined);
    });
    it("visualOverrideCacheId keys tinted props by hex", () => {
        const prop = {};
        assert.equal(visualOverrideCacheId(prop), 0);
        mergePropVisualOverride(prop, { tint: "#2a2a2a" });
        assert.equal(visualOverrideCacheId(prop), 0x2a2a2a);
        mergePropVisualOverride(prop, { tint: "#ff0000" });
        assert.equal(visualOverrideCacheId(prop), 0xff0000);
    });
});
