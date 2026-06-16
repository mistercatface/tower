import { registerRuntimeSurfaceProfile } from "../../../Config/procedural/profiles.js";
import { invalidateProfileScratch } from "../../../Libraries/WorldSurface/ProfileBakeResolver.js";
import { TileWorkerCoordinator } from "../../../Libraries/WorldSurface/TileWorkerCoordinator.js";
import { getSurfaceProfileRevision } from "../../../Libraries/WorldSurface/SurfaceProfileRevision.js";
import { invalidateWallAtlasKeyMemos } from "../../../Render/game/wallSurfaceInvalidation.js";
import { getGameWorldSurfaceSettings } from "../../../Render/WorldSurfaceBootstrap.js";
import { drawAnimatedSurfaceZones } from "../../../Libraries/WorldSurface/animatedSurfaceDraw.js";
import { CombatParticles } from "../../../Libraries/Render/CombatParticles.js";
import { floorPropEffectPass } from "../../../Libraries/Sandbox/floorProps.js";
import { getGameState } from "../../../GameState/GameState.js";
import { Renderer } from "../../../Render/Render.js";
import { normalizeWorldRenderMode, WORLD_RENDER_MODE_DEFAULT } from "../../../Render/WorldRenderMode.js";
import { ensureLabPathDebugCache, labPathDebugCacheKey } from "../../../Libraries/Render/map/labMapCaches.js";
import { buildProfileFromEditor, RUNTIME_LAB_PROFILE_ID } from "./profile/ProfileEditor.js";
/** @type {import("../../../Render/Render.js").SimulationSceneHooks} */
const editorSceneHooks = {
    drawGroundOverlays(state, viewport, ctx) {
        drawAnimatedSurfaceZones(ctx, state.sandbox.animatedSurfaceZones, state, viewport);
    },
    drawPostSimulation(state, viewport, ctx) {
        CombatParticles.renderAll(ctx, state, viewport);
    },
    simulationEffectPasses: [
        floorPropEffectPass,
        {
            zIndex: 65,
            draw(_state, _viewport, ctx) {
                const controller = getGameState().sandbox.controller;
                controller?.drawPlacePreview(ctx);
                controller?.drawSelectionRings(ctx);
                controller?.drawPropTileCells(ctx);
            },
        },
        {
            zIndex: 72,
            draw(_state, _viewport, ctx) {
                const controller = getGameState().sandbox.controller;
                controller?.drawBehaviorOverlays(ctx);
                controller?.drawMarqueeOverlay(ctx);
                controller?.drawPathOverlay(ctx);
                controller?.drawLaunchPreview(ctx);
            },
        },
    ],
};
let labRenderer = null;
let labRendererSettings = null;
let lastProfileBakeKey = "";
let labViewDirty = true;
export function requestLabFrame() {
    labViewDirty = true;
}
export function shouldRenderLabFrame(state) {
    if (!state.isPaused) return true;
    if (state.worldSurfaces.hasPendingSurfaceBakes()) return true;
    return labViewDirty;
}
function buildLabRuntimeProfile() {
    const profile = buildProfileFromEditor();
    if (profile?.animation) delete profile.animation;
    return profile;
}
/** @param {import("../state.js").TileLabGameState} state */
export function applyLabWorldRenderMode(state) {
    if (!state.editor.canvas) return;
    getLabRenderer(state.editor.canvas, state.editor.ctx, state).applyWorldRenderMode(state.worldRenderMode);
}
function getLabRenderer(canvas, ctx, state) {
    const settings = getGameWorldSurfaceSettings();
    if (!labRenderer || labRenderer.canvas !== canvas || labRendererSettings !== settings) {
        labRenderer = new Renderer(canvas, ctx, { sceneHooks: editorSceneHooks });
        labRendererSettings = settings;
    }
    labRenderer.applyWorldRenderMode(state?.worldRenderMode ?? WORLD_RENDER_MODE_DEFAULT);
    return labRenderer;
}
function maybeClearProfileBakeCaches(state, profileId) {
    const key = `${profileId}:${getSurfaceProfileRevision(profileId)}:${state.worldSurfaces.worldSurfaceSeed ?? 0}`;
    if (lastProfileBakeKey === key) return;
    lastProfileBakeKey = key;
    invalidateWallAtlasKeyMemos(state);
    state.worldSurfaces.clearBakeCache();
    labRenderer = null;
}
/** @param {import("../state.js").TileLabGameState} state */
export function pushEditorProfile(state) {
    invalidateProfileScratch(RUNTIME_LAB_PROFILE_ID);
    invalidateWallAtlasKeyMemos(state);
    state.worldSurfaces.clearBakeCache();
    lastProfileBakeKey = "";
    labRenderer = null;
    const profile = buildLabRuntimeProfile();
    registerRuntimeSurfaceProfile(RUNTIME_LAB_PROFILE_ID, profile);
    void TileWorkerCoordinator.registerRuntimeProfile(RUNTIME_LAB_PROFILE_ID, profile);
}
/** @param {import("../state.js").TileLabGameState} state */
export function drawLabFrame(state) {
    const canvas = state.editor.canvas;
    const ctx = state.editor.ctx;
    const viewport = state.viewport;
    const showVignette = document.getElementById("showVignetteInput").checked;
    const showPathDebug = document.getElementById("showPathDebugInput").checked;
    const prevProfileOverride = state.worldSurfaces.surfaceProfileOverride;
    state.worldSurfaces.surfaceProfileOverride = RUNTIME_LAB_PROFILE_ID;
    maybeClearProfileBakeCaches(state, RUNTIME_LAB_PROFILE_ID);
    getLabRenderer(canvas, ctx, state).renderSimulationScene(state, viewport);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#080a0e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    if (showPathDebug) {
        if (state._labPathDebugKey !== labPathDebugCacheKey(state) && !state._labPathDebugRedrawScheduled) {
            state._labPathDebugRedrawScheduled = true;
            void ensureLabPathDebugCache(state).then(() => {
                state._labPathDebugRedrawScheduled = false;
                drawLabFrame(state);
            });
        }
        if (state.mapPathDebugCache) {
            ctx.save();
            viewport.apply(ctx);
            const pathCache = state.mapPathDebugCache;
            ctx.drawImage(pathCache.canvas, pathCache.minX, pathCache.minY);
            ctx.restore();
        }
    }
    ctx.save();
    viewport.apply(ctx);
    state.sandbox.controller?.drawOverlay(ctx);
    ctx.restore();
    state.worldSurfaces.surfaceProfileOverride = prevProfileOverride;
    labViewDirty = false;
    if (showVignette) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.rect(0, 0, canvas.width, canvas.height);
        ctx.arc(viewport.cx, viewport.cy, viewport.getVisualRadius(), 0, Math.PI * 2, true);
        ctx.fill("evenodd");
        ctx.restore();
    }
}
/** @param {import("../state.js").TileLabGameState} state */
export function repaintUntilBakesDone(state) {
    requestLabFrame();
    drawLabFrame(state);
}
