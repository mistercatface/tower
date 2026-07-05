import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { getPropVisualBrightness, getPropVisualTint } from "../Libraries/Color/visualOverride.js";
import { getPropRadius } from "../Libraries/Props/props.js";
import { propFootprintHalfExtents } from "../Libraries/Props/props.js";
import { createSandboxSession } from "../Libraries/Sandbox/sandbox.js";
import { visualOverrideCacheKey } from "../Libraries/Color/visualOverride.js";
function createSpawnTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 512, 512);
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        viewport: { x: 128, y: 128 },
    };
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
        assert.equal(getPropRadius(prop), 6);
        assert.equal(getPropVisualTint(prop), "#ff0000");
        assert.equal(getPropVisualBrightness(prop), 1.25);
    });

    it("places custom box with resizable footprint and coat", () => {
        const state = createSpawnTestState();
        const session = createSandboxSession(state);
        session.setPlacePaletteKey("prop:custom_box");
        session.setSpawnBoxWidth(24);
        session.setSpawnBoxHeight(32);
        session.setSpawnVisualOverrideTint("#00aa88");
        assert.equal(session.spawnAt(96, 96), true);
        const prop = state.worldProps[0];
        assert.equal(prop.type, "custom_box");
        const span = propFootprintHalfExtents(prop);
        assert.equal(Math.round(span.x * 2), 24);
        assert.equal(Math.round(span.y * 2), 32);
        assert.equal(getPropVisualTint(prop), "#00aa88");
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
