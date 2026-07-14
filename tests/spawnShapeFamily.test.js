import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { entityFootprintHalfExtentsInto, WorldProp, createSpherePrimitive } from "../Libraries/Props/props.js";
import { ENGINE_F32, M_VEC_A, entityWallProfileId, getProfileId } from "../Core/engineMemory.js";
import { createSandboxKineticWorld, createSandboxControllerSession, createSandboxTestController } from "./harness/stateFactories.js";
import { collectLiveWorldProps } from "./harness/fractureHarness.js";
import { bindWallChunkTexturePipeline } from "../Libraries/Render/render.js";
import { getWallChunkSpriteCacheKey } from "../Libraries/Canvas/canvas.js";
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
        const session = createSandboxControllerSession(state);
        session.setPlacePaletteKey("prop:ball");
        session.setSpawnBallRadius(6);
        assert.equal(session.spawnAt(64, 64), true);
        const prop = collectLiveWorldProps(state.entityRegistry)[0];
        assert.equal(prop.type, "ball");
        assert.equal(prop.radius, 6);
        assert.equal(prop.wallChunkProfileId, "poolTableFelt");
        assert.ok(prop.wallChunkHeightPx > 0);
        assert.equal(typeof getWallChunkSpriteCacheKey(prop._physId), "number");
        assert.notEqual(getWallChunkSpriteCacheKey(prop._physId), 0);
    });

    it("places ball with session surface profile override", () => {
        const state = createSpawnTestState();
        const session = createSandboxControllerSession(state);
        session.setPlacePaletteKey("prop:ball");
        session.setSpawnSurfaceProfileId("tomatoGarden");
        assert.equal(session.spawnAt(64, 64), true);
        const prop = collectLiveWorldProps(state.entityRegistry)[0];
        assert.equal(prop.wallChunkProfileId, "tomatoGarden");
        const eid = prop._physId;
        const key1 = getWallChunkSpriteCacheKey(eid);
        const originalProfile = entityWallProfileId[eid];
        entityWallProfileId[eid] = getProfileId("poolTableFelt");
        const key2 = getWallChunkSpriteCacheKey(eid);
        assert.notEqual(key1, key2);
        entityWallProfileId[eid] = originalProfile;
    });

    it("serialize keeps non-default wallChunkProfileId and omits default", () => {
        const overridden = createSpawnTestState();
        const sessionA = createSandboxControllerSession(overridden);
        sessionA.setPlacePaletteKey("prop:box");
        sessionA.setSpawnSurfaceProfileId("toxicSludge");
        assert.equal(sessionA.spawnAt(80, 80), true);
        assert.equal(JSON.parse(createSandboxTestController(overridden).exportSceneSnapshot()).props[0].wallChunkProfileId, "toxicSludge");
        const defaults = createSpawnTestState();
        const sessionB = createSandboxControllerSession(defaults);
        sessionB.setPlacePaletteKey("prop:box");
        assert.equal(sessionB.getSpawnSurfaceProfileId(), "poolTableFelt");
        assert.equal(sessionB.spawnAt(96, 96), true);
        assert.equal(JSON.parse(createSandboxTestController(defaults).exportSceneSnapshot()).props[0].wallChunkProfileId, undefined);
    });

    it("places box with resizable footprint, surface profile, and fracture off by default", () => {
        const state = createSpawnTestState();
        const session = createSandboxControllerSession(state);
        session.setPlacePaletteKey("prop:box");
        session.setSpawnBoxWidth(24);
        session.setSpawnBoxHeight(32);
        assert.equal(session.spawnAt(96, 96), true);
        const prop = collectLiveWorldProps(state.entityRegistry)[0];
        assert.equal(prop.type, "box");
        assert.equal(prop.fractureEnabled, false);
        assert.equal(prop.wallChunkProfileId, "poolTableFelt");
        assert.equal(prop.wallChunkHeightPx, 16);
        entityFootprintHalfExtentsInto(ENGINE_F32, M_VEC_A, prop._physId);
        assert.equal(Math.round(ENGINE_F32[M_VEC_A] * 2), 24);
        assert.equal(Math.round(ENGINE_F32[M_VEC_A + 1] * 2), 32);
    });

    it("places box with spawn fracture enabled", () => {
        const state = createSpawnTestState();
        const session = createSandboxControllerSession(state);
        session.setPlacePaletteKey("prop:hex_block");
        session.setSpawnFractureEnabled(true);
        assert.equal(session.spawnAt(64, 64), true);
        const spawned = collectLiveWorldProps(state.entityRegistry)[0];
        assert.equal(spawned.type, "hex_block");
        assert.equal(spawned.fractureEnabled, true);
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
        bindWallChunkTexturePipeline({
            _wallChunkReady: true,
            _wallChunkCapCanvas: { width: 128, height: 128 },
            _wallChunkSideCanvas: null,
            settings: { surfaceBakeScale: 1, cellSize: 16, cellsPerChunk: 8 },
        });
        const draw = createSpherePrimitive();
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
        bindWallChunkTexturePipeline(null);
    });

    it("radial sphere draws nothing until wall-chunk textures are ready", () => {
        bindWallChunkTexturePipeline(null);
        const prop = new WorldProp(0, 0, "ball", 0);
        const draw = createSpherePrimitive();
        let fills = 0;
        const ctx = {
            get fillStyle() { return ""; },
            set fillStyle(_v) {},
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
        assert.equal(fills, 0);
    });
});
