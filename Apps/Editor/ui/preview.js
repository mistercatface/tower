import { registerRuntimeSurfaceProfile } from "../../../Config/procedural/profiles.js";
import { invalidateProfileScratch } from "../../../Libraries/WorldSurface/ProfileBakeResolver.js";
import { TileWorkerCoordinator } from "../../../Libraries/WorldSurface/TileWorkerCoordinator.js";
import { getSurfaceProfileRevision } from "../../../Libraries/WorldSurface/SurfaceProfileRevision.js";
import { invalidateWallAtlasKeyMemos } from "../../../Render/game/wallSurfaceInvalidation.js";
import { getGameWorldSurfaceSettings } from "../../../Render/WorldSurfaceBootstrap.js";
import { drawAnimatedSurfaceZones } from "../../../Libraries/WorldSurface/animatedSurfaceDraw.js";
import { floorPropEffectPass } from "../../../Libraries/Sandbox/floorProps.js";
import { getGameState } from "../../../GameState/GameState.js";
import { Renderer } from "../../../Render/Render.js";
import { normalizeWorldRenderMode, WORLD_RENDER_MODE_DEFAULT } from "../../../Render/WorldRenderMode.js";
import { drawLabPathDebugOverlay } from "../../../Libraries/Render/map/labMapCaches.js";
import { drawOverlayCommands } from "../../../Libraries/Render/overlays/drawOverlayCommands.js";
import { buildProfileFromEditor, RUNTIME_LAB_PROFILE_ID } from "./profile/ProfileEditor.js";
/** @type {import("../../../Render/Render.js").SimulationSceneHooks} */
const editorSceneHooks = {
    drawGroundOverlays(state, viewport, ctx) {
        drawAnimatedSurfaceZones(ctx, state.sandbox.animatedSurfaceZones, state, viewport);
    },
    simulationEffectPasses: [
        floorPropEffectPass,
        {
            // After floor stamps (10.5), before draw3DBuildings props/walls (70).
            zIndex: 15,
            draw(_state, viewport, ctx) {
                const controller = getGameState().sandbox.controller;
                if (!controller) return;
                drawOverlayCommands(ctx, controller.collectOverlayCommands(), { px: viewport.x, py: viewport.y, zoom: viewport.zoom });
            },
        },
    ],
};
let labRenderer = null;
let labRendererSettings = null;
let lastProfileBakeKey = "";
let labViewDirty = true;
let showLabVignette = false;
let showLabPathDebug = false;
export function setLabVignetteEnabled(enabled) {
    showLabVignette = enabled;
    markLabViewDirty();
}
export function markLabViewDirty() {
    labViewDirty = true;
}
export function mountLabDrawOptions() {
    const vignetteInput = document.getElementById("showVignetteInput");
    const pathDebugInput = document.getElementById("showPathDebugInput");
    showLabVignette = vignetteInput.checked;
    showLabPathDebug = pathDebugInput.checked;
    vignetteInput.addEventListener("change", () => {
        showLabVignette = vignetteInput.checked;
        markLabViewDirty();
    });
    pathDebugInput.addEventListener("change", () => {
        showLabPathDebug = pathDebugInput.checked;
        markLabViewDirty();
    });
}
export function isShowLabPathDebug() {
    return showLabPathDebug;
}
/** Canvas input marks the lab view dirty while paused (place preview, clicks). Camera pan/zoom goes through setCamera. */
export function mountLabFrameRefresh(canvas) {
    canvas.addEventListener("pointerdown", markLabViewDirty);
    canvas.addEventListener("pointermove", (e) => {
        if (e.buttons & 2) return;
        markLabViewDirty();
    });
    canvas.addEventListener("pointerleave", markLabViewDirty);
    const uiRoot = document.getElementById("ui-root");
    uiRoot?.addEventListener("change", markLabViewDirty);
    uiRoot?.addEventListener("input", (e) => {
        if (e.target instanceof HTMLInputElement && (e.target.type === "color" || e.target.classList.contains("param-color-hex-input"))) markLabViewDirty();
    });
    return markLabViewDirty;
}
export function wrapLabUiSync(sync) {
    return () => {
        markLabViewDirty();
        sync();
    };
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
/** @param {import("../state.js").TileLabGameState} state @returns {Promise<void>} */
export function pushEditorProfile(state) {
    invalidateProfileScratch(RUNTIME_LAB_PROFILE_ID);
    invalidateWallAtlasKeyMemos(state);
    state.worldSurfaces.clearBakeCache();
    lastProfileBakeKey = "";
    labRenderer = null;
    const profile = buildLabRuntimeProfile();
    if (!profile) throw new Error("Lab runtime profile is not initialized");
    registerRuntimeSurfaceProfile(RUNTIME_LAB_PROFILE_ID, profile);
    return TileWorkerCoordinator.registerRuntimeProfile(RUNTIME_LAB_PROFILE_ID, profile);
}
/** @param {import("../state.js").TileLabGameState} state */
export function drawLabFrame(state) {
    const canvas = state.editor.canvas;
    const ctx = state.editor.ctx;
    const viewport = state.viewport;
    const showVignette = showLabVignette;
    const showPathDebug = showLabPathDebug;
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
    if (showPathDebug) drawLabPathDebugOverlay(ctx, viewport, state, markLabViewDirty);
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
    markLabViewDirty();
    drawLabFrame(state);
}
