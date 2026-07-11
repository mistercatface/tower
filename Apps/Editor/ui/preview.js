import { registerRuntimeSurfaceProfile } from "../../../Config/procedural/profiles.js";
import { TileWorkerCoordinator } from "../../../Libraries/WorldSurface/worldSurface.js";
import { getSurfaceProfileRevision } from "../../../Libraries/WorldSurface/worldSurface.js";
import { invalidateStaticGridEdgeRailDrawCache } from "../../../Libraries/Render/render.js";
import { invalidateStaticGridWallDrawCache } from "../../../Libraries/Render/render.js";
import { gameWorldSurfaceSettings } from "../../../Render/WorldSurfaceBootstrap.js";
import { floorEffectPass } from "../../../Libraries/Props/props.js";
import { getGameState } from "../../../GameState/GameState.js";
import { Renderer } from "../../../Render/Render.js";
import { WORLD_RENDER_MODE_FLAT2D, NAV_PATH_DEBUG_OFF, NAV_PATH_DEBUG_COUNT } from "../../../Core/engineEnums.js";
import { getNavPathDebugCache } from "../../../Libraries/Navigation/navDebug.js";
import { drawOverlayCommands } from "../../../Libraries/Render/render.js";
import { drawLosShadowOverlay } from "../../../Libraries/Render/render.js";
import { buildProfileFromEditor, RUNTIME_LAB_PROFILE_ID } from "./profile/ProfileEditor.js";
/** @type {import("../../../Render/Render.js").SimulationSceneHooks} */
const editorSceneHooks = {
    drawGroundOverlays(state, viewport, ctx) {},
    simulationEffectPasses: [
        floorEffectPass,
        {
            // After floor stamps (10.5), before draw3DBuildings props/walls (70).
            zIndex: 15,
            draw(_state, viewport, ctx) {
                const controller = getGameState().sandbox.controller;
                if (!controller) return;
                drawOverlayCommands(ctx, controller.collectOverlayCommands(), viewport);
            },
        },
        {
            // After structure (70), bloom (71), and entity layers (100) — darkness over the full scene.
            zIndex: 110,
            draw(state, viewport, ctx) {
                if (!state.losShadowStrength || !state.obstacleGrid) return;
                drawLosShadowOverlay(ctx, viewport, state.obstacleGrid, { overlayAlpha: state.losShadowStrength });
            },
        },
        {
            zIndex: 120,
            draw(state, viewport, ctx) {
                if (!isLabPathDebugActive()) return;
                getNavPathDebugCache(state).draw(ctx, state, getLabPathDebugMode(), markLabViewDirty);
            },
        },
    ],
};
let labRenderer = null;
let labRendererSettings = null;
let lastProfileBakeKey = "";
let labViewDirty = true;
let showLabVignette = false;
let labPathDebugMode = NAV_PATH_DEBUG_OFF;
const PATH_DEBUG_MODE_LABELS = ["Nav: Off", "Nav: All", "Nav: Reachable"];
function clampLabPathDebugMode(mode) {
    const m = mode | 0;
    return m === mode && m >= 0 && m < NAV_PATH_DEBUG_COUNT ? m : NAV_PATH_DEBUG_OFF;
}
export function setLabVignetteEnabled(enabled) {
    showLabVignette = enabled;
    const vignetteBtn = document.getElementById("showVignetteBtn");
    if (vignetteBtn) vignetteBtn.textContent = showLabVignette ? "Overlay: On" : "Overlay: Off";
    const vignetteInput = document.getElementById("showVignetteInput");
    if (vignetteInput) vignetteInput.checked = showLabVignette;
    markLabViewDirty();
}
function syncPathDebugModeButtonLabel() {
    const btn = document.getElementById("pathDebugModeBtn");
    if (btn) btn.textContent = PATH_DEBUG_MODE_LABELS[labPathDebugMode];
}
function cycleLabPathDebugMode() {
    labPathDebugMode = (labPathDebugMode + 1) % NAV_PATH_DEBUG_COUNT;
    syncPathDebugModeButtonLabel();
    markLabViewDirty();
}
export function getLabPathDebugMode() {
    return labPathDebugMode;
}
export function setLabPathDebugMode(mode) {
    labPathDebugMode = clampLabPathDebugMode(mode);
    syncPathDebugModeButtonLabel();
    markLabViewDirty();
}
export function isLabPathDebugActive() {
    return labPathDebugMode !== NAV_PATH_DEBUG_OFF;
}
export function markLabViewDirty() {
    labViewDirty = true;
}
function formatShadowStrengthLabel(strength) {
    if (strength <= 0) return "Off";
    return `${Math.round(strength * 100)}%`;
}
export function mountLabDrawOptions(state) {
    const vignetteInput = document.getElementById("showVignetteInput");
    const vignetteBtn = document.getElementById("showVignetteBtn");
    const pathDebugModeBtn = document.getElementById("pathDebugModeBtn");
    const shadowSlider = document.getElementById("editorShadowSlider");
    const shadowValue = document.getElementById("editorShadowValue");
    if (vignetteInput) {
        showLabVignette = vignetteInput.checked;
        vignetteInput.addEventListener("change", () => {
            showLabVignette = vignetteInput.checked;
            markLabViewDirty();
        });
    } else if (vignetteBtn) {
        const updateVignetteBtnText = () => {
            vignetteBtn.textContent = showLabVignette ? "Overlay: On" : "Overlay: Off";
        };
        updateVignetteBtnText();
        vignetteBtn.addEventListener("click", () => {
            showLabVignette = !showLabVignette;
            updateVignetteBtnText();
            markLabViewDirty();
        });
    }
    syncPathDebugModeButtonLabel();
    pathDebugModeBtn.addEventListener("click", () => cycleLabPathDebugMode());
    if (shadowSlider && shadowValue) {
        const initialStrength = state.losShadowStrength ?? 0.0;
        shadowSlider.value = String(Math.round(initialStrength * 100));
        shadowValue.textContent = formatShadowStrengthLabel(initialStrength);
        shadowSlider.addEventListener("input", () => {
            const val = Number(shadowSlider.value);
            const strength = Math.max(0, Math.min(1, val / 100));
            state.losShadowStrength = strength;
            shadowValue.textContent = formatShadowStrengthLabel(strength);
            markLabViewDirty();
        });
    }
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
    const settings = gameWorldSurfaceSettings;
    if (!labRenderer || labRenderer.canvas !== canvas || labRendererSettings !== settings) {
        labRenderer = new Renderer(canvas, ctx, { sceneHooks: editorSceneHooks });
        labRendererSettings = settings;
    }
    labRenderer.applyWorldRenderMode(state?.worldRenderMode ?? WORLD_RENDER_MODE_FLAT2D);
    return labRenderer;
}
function invalidateWallDrawCaches() {
    invalidateStaticGridWallDrawCache();
    invalidateStaticGridEdgeRailDrawCache();
}
function maybeClearProfileBakeCaches(state) {
    const profileId = state.worldSurfaces.activeSurfaceProfileId;
    const key = `${profileId}:${getSurfaceProfileRevision(profileId)}:${state.worldSurfaces.worldSurfaceSeed}`;
    if (lastProfileBakeKey === key) return;
    lastProfileBakeKey = key;
    invalidateWallDrawCaches();
    state.worldSurfaces.clearBakeCache();
    labRenderer = null;
}
/** @param {import("../state.js").TileLabGameState} state @returns {Promise<void>} */
export function pushEditorProfile(state) {
    invalidateWallDrawCaches();
    state.worldSurfaces.clearBakeCache();
    lastProfileBakeKey = "";
    labRenderer = null;
    const profile = buildLabRuntimeProfile();
    if (!profile) throw new Error("Lab runtime profile is not initialized");
    profile.id = RUNTIME_LAB_PROFILE_ID;
    registerRuntimeSurfaceProfile(profile);
    state.worldSurfaces.activeSurfaceProfileId = RUNTIME_LAB_PROFILE_ID;
    return TileWorkerCoordinator.registerRuntimeProfile(profile);
}
/** @param {import("../state.js").TileLabGameState} state */
export function drawLabFrame(state) {
    const canvas = state.editor.canvas;
    const ctx = state.editor.ctx;
    const viewport = state.viewport;
    const showVignette = showLabVignette;
    maybeClearProfileBakeCaches(state);
    getLabRenderer(canvas, ctx, state).renderSimulationScene(state, viewport);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#080a0e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
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
