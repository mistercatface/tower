import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPropVisualBrightness, getPropVisualTint } from "../Libraries/Color/visualOverride.js";
import { getCirclePropRadius, propFootprintHalfExtentsInto } from "../Libraries/Props/props.js";
import { ENGINE_F32, M_VEC_A } from "../Core/engineMemory.js";
import { createSandboxSession } from "../Libraries/Sandbox/sandbox.js";
import { visualOverrideCacheKey } from "../Libraries/Color/visualOverride.js";
import { createSandboxKineticWorld } from "./harness/stateFactories.js";

function createSpawnTestState() {
    return createSandboxKineticWorld(32, 32, { viewport: { x: 128, y: 128 } });
}

describe("spawn shape family defaults", () => {
    it("places ball with spawn radius, tint, and brightness", () => {
        const state = createSpawnTestState();
        const session = createSandboxSession(state);
        session.setPlacePaletteKey("prop:ball");
        session.setSpawnBallRadius(6);
        session.setSpawnVisualOverrideTint("#ff0000");
        session.setSpawnVisualOverrideBrightness(1.25);
        assert.equal(session.spawnAt(64, 64), true);
        const prop = state.worldProps[0];
        assert.equal(prop.type, "ball");
        assert.equal(getCirclePropRadius(prop), 6);
        assert.equal(getPropVisualTint(prop), "#ff0000");
        assert.equal(getPropVisualBrightness(prop), 1.25);
    });

    it("places box with resizable footprint, surface profile, and fracture off by default", () => {
        const state = createSpawnTestState();
        const session = createSandboxSession(state);
        session.setPlacePaletteKey("prop:box");
        session.setSpawnBoxWidth(24);
        session.setSpawnBoxHeight(32);
        session.setSpawnVisualOverrideTint("#00aa88");
        assert.equal(session.spawnAt(96, 96), true);
        const prop = state.worldProps[0];
        assert.equal(prop.type, "box");
        assert.equal(prop.fractureEnabled, false);
        assert.equal(prop.wallChunkProfileId, "poolTableFelt");
        assert.equal(prop.wallChunkHeightPx, 16);
        propFootprintHalfExtentsInto(ENGINE_F32, M_VEC_A, prop);
        assert.equal(Math.round(ENGINE_F32[M_VEC_A] * 2), 24);
        assert.equal(Math.round(ENGINE_F32[M_VEC_A + 1] * 2), 32);
        assert.equal(getPropVisualTint(prop), null);
    });

    it("places box with spawn fracture enabled", () => {
        const state = createSpawnTestState();
        const session = createSandboxSession(state);
        session.setPlacePaletteKey("prop:hex_block");
        session.setSpawnFractureEnabled(true);
        assert.equal(session.spawnAt(64, 64), true);
        assert.equal(state.worldProps[0].type, "hex_block");
        assert.equal(state.worldProps[0].fractureEnabled, true);
    });

    it("visualOverride cache key changes when coat changes", () => {
        const prop = { visualOverride: { tint: "#888888" } };
        const before = visualOverrideCacheKey(prop);
        prop.visualOverride.tint = "#0000ff";
        assert.notEqual(visualOverrideCacheKey(prop), before);
        prop.visualOverride.tint = "#888888";
        delete prop.visualOverride.brightness;
        const base = visualOverrideCacheKey(prop);
        prop.visualOverride.brightness = 1.5;
        assert.notEqual(visualOverrideCacheKey(prop), base);
    });
});
