import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPropVisualTint } from "../Libraries/Color/visualOverride.js";
import { getCirclePropRadius, propFootprintHalfExtentsInto, WorldProp, createSpherePrimitive, resolveVisualAttachmentProps } from "../Libraries/Props/props.js";
import { ENGINE_F32, M_VEC_A } from "../Core/engineMemory.js";
import { createSandboxSession, collectFlatPlacedSandboxPropEntries } from "../Libraries/Sandbox/sandbox.js";
import { visualOverrideCacheKey } from "../Libraries/Color/visualOverride.js";
import { createSandboxKineticWorld } from "./harness/stateFactories.js";
import { getWallChunkSpriteCacheKey } from "../Libraries/Render/render.js";
import { DEFAULT_CAMERA_HEIGHT, DEFAULT_PERSPECTIVE_STRENGTH } from "../Libraries/Viewport/Viewport.js";
import propCatalog from "../Assets/props/index.js";
import { PROP_PRIMITIVE_SPHERE, PROP_PRIMITIVE_POLYGON, PROP_DRAW_WALL_CHUNK, PROP_RENDER_MODE_NONE } from "../Core/engineEnums.js";

function createSpawnTestState() {
    return createSandboxKineticWorld(32, 32, { viewport: { x: 128, y: 128 } });
}

describe("spawn shape family defaults", () => {
    it("catalog assets use integer primitive draw and renderMode enums", () => {
        assert.equal(propCatalog.ball.primitive, PROP_PRIMITIVE_SPHERE);
        assert.equal(propCatalog.box.primitive, PROP_PRIMITIVE_POLYGON);
        assert.equal(propCatalog.wall_voxel_chunk.primitive, PROP_PRIMITIVE_POLYGON);
        assert.equal(propCatalog.wall_voxel_chunk.draw, PROP_DRAW_WALL_CHUNK);
        assert.equal(propCatalog.floor_belt.physics.renderMode, PROP_RENDER_MODE_NONE);
    });

    it("places ball with spawn radius and poolTableFelt profile (no coat)", () => {
        const state = createSpawnTestState();
        const session = createSandboxSession(state);
        session.setPlacePaletteKey("prop:ball");
        session.setSpawnBallRadius(6);
        assert.equal(session.spawnAt(64, 64), true);
        const prop = state.worldProps[0];
        assert.equal(prop.type, "ball");
        assert.equal(getCirclePropRadius(prop), 6);
        assert.equal(prop.wallChunkProfileId, "poolTableFelt");
        assert.ok(prop.wallChunkHeightPx > 0);
        assert.equal(getPropVisualTint(prop), null);
        assert.match(getWallChunkSpriteCacheKey(prop), /^wallchunk:poolTableFelt:/);
    });

    it("places ball with session surface profile override", () => {
        const state = createSpawnTestState();
        const session = createSandboxSession(state);
        session.setPlacePaletteKey("prop:ball");
        session.setSpawnSurfaceProfileId("tomatoGarden");
        assert.equal(session.spawnAt(64, 64), true);
        const prop = state.worldProps[0];
        assert.equal(prop.wallChunkProfileId, "tomatoGarden");
        assert.equal(prop._wallChunkTextures, null);
        assert.equal(prop._wallChunkTextureReady, false);
        assert.match(getWallChunkSpriteCacheKey(prop), /^wallchunk:tomatoGarden:/);
    });

    it("serialize keeps non-default wallChunkProfileId and omits default", () => {
        const overridden = createSpawnTestState();
        const sessionA = createSandboxSession(overridden);
        sessionA.setPlacePaletteKey("prop:box");
        sessionA.setSpawnSurfaceProfileId("toxicSludge");
        assert.equal(sessionA.spawnAt(80, 80), true);
        assert.equal(collectFlatPlacedSandboxPropEntries(overridden).props[0].wallChunkProfileId, "toxicSludge");
        const defaults = createSpawnTestState();
        const sessionB = createSandboxSession(defaults);
        sessionB.setPlacePaletteKey("prop:box");
        assert.equal(sessionB.getSpawnSurfaceProfileId(), "poolTableFelt");
        assert.equal(sessionB.spawnAt(96, 96), true);
        assert.equal(collectFlatPlacedSandboxPropEntries(defaults).props[0].wallChunkProfileId, undefined);
    });

    it("places box with resizable footprint, surface profile, and fracture off by default", () => {
        const state = createSpawnTestState();
        const session = createSandboxSession(state);
        session.setPlacePaletteKey("prop:box");
        session.setSpawnBoxWidth(24);
        session.setSpawnBoxHeight(32);
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

describe("sphere surface profile draw", () => {
    const viewport = {
        x: 0,
        y: 0,
        zoom: 1,
        cameraHeight: DEFAULT_CAMERA_HEIGHT,
        perspectiveStrength: DEFAULT_PERSPECTIVE_STRENGTH,
    };

    it("flat sphere disc fills a circle path with pattern when textured", () => {
        const prop = new WorldProp(10, 20, "ball", 0);
        prop._wallChunkTextures = { ready: true, scale: 1, chunkSizePx: 128, capCanvas: { width: 128, height: 128 } };
        const draw = createSpherePrimitive(propCatalog.ball.visuals);
        let arcs = 0;
        let fills = 0;
        let patterns = 0;
        let meshFills = 0;
        const ctx = {
            fillStyle: "",
            beginPath() {},
            arc() { arcs++; },
            closePath() {},
            fill() { fills++; },
            moveTo() { meshFills++; },
            lineTo() { meshFills++; },
            createPattern() {
                patterns++;
                return { setTransform() {} };
            },
            save() {},
            restore() {},
            clip() {},
            drawImage() {},
        };
        draw(ctx, prop, viewport, true);
        assert.equal(patterns, 1);
        assert.equal(arcs, 1);
        assert.equal(fills, 1);
        assert.equal(meshFills, 0);
    });

    it("radial pending sphere fills faces without coat panels", () => {
        const prop = new WorldProp(0, 0, "ball", 0);
        const draw = createSpherePrimitive(propCatalog.ball.visuals);
        let fills = 0;
        const fillStyles = new Set();
        const ctx = {
            get fillStyle() { return ""; },
            set fillStyle(v) { fillStyles.add(v); },
            beginPath() {},
            moveTo() {},
            lineTo() {},
            closePath() {},
            fill() { fills++; },
            save() {},
            restore() {},
            clip() {},
            drawImage() {},
            createPattern() { return null; },
        };
        draw(ctx, prop, viewport, false);
        assert.ok(fills > 4);
        assert.equal(fillStyles.size, 1);
    });

    it("boid attachment stamps profile and copies parent textures", () => {
        const parent = new WorldProp(0, 0, "boid_triangle", 0);
        parent._wallChunkTextures = { ready: true, scale: 1, chunkSizePx: 64, capCanvas: { width: 64, height: 64 } };
        parent._wallChunkTextureReady = true;
        const { after } = resolveVisualAttachmentProps(parent);
        assert.ok(after.length >= 1);
        const wedge = after[0];
        assert.equal(wedge.type, "tri_wedge");
        assert.equal(wedge.wallChunkProfileId, "poolTableFelt");
        assert.equal(wedge._wallChunkTextures, parent._wallChunkTextures);
    });

    it("boid attachment inherits parent surface profile override", () => {
        const parent = new WorldProp(0, 0, "boid_triangle", 0);
        parent.wallChunkProfileId = "tomatoGarden";
        parent._wallChunkTextures = { ready: true, scale: 1, chunkSizePx: 64, capCanvas: { width: 64, height: 64 } };
        parent._wallChunkTextureReady = true;
        const { after } = resolveVisualAttachmentProps(parent);
        assert.equal(after[0].wallChunkProfileId, "tomatoGarden");
        assert.equal(after[0]._wallChunkTextures, parent._wallChunkTextures);
    });
});
