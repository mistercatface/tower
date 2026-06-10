import { registerRuntimeSurfaceProfile } from "../../../Config/procedural/profiles.js";
import { invalidateProfileScratch } from "../../../Libraries/WorldSurface/ProfileBakeResolver.js";
import { TileWorkerCoordinator } from "../../../Libraries/WorldSurface/TileWorkerCoordinator.js";
import { drawMapPathDebugCache } from "../../../Libraries/Render/map/MapPathDebugCache.js";
import { drawMapWallCache } from "../../../Libraries/Render/map/MapWallCache.js";
import { getSurfaceProfileRevision } from "../../../Libraries/WorldSurface/SurfaceProfileRevision.js";
import { invalidateWallAtlasKeyMemos } from "../../../Render/game/wallSurfaceInvalidation.js";
import { getGameWorldSurfaceSettings } from "../../../Render/WorldSurfaceBootstrap.js";
import { Renderer } from "../../../Render/Render.js";
import { sandboxController } from "../world/tilelabSandbox.js";
import { paintMapOverviewFrame } from "./mapOverview.js";
import { buildProfileFromEditor, RUNTIME_LAB_PROFILE_ID } from "./profile/ProfileEditor.js";
let labRenderer = null;
let labRendererSettings = null;
let lastProfileBakeKey = "";
let bakeRepaintRaf = null;
function buildLabRuntimeProfile() {
    const profile = buildProfileFromEditor();
    if (profile?.animation) delete profile.animation;
    return profile;
}
function getLabRenderer(canvas, ctx) {
    const settings = getGameWorldSurfaceSettings();
    if (!labRenderer || labRenderer.canvas !== canvas || labRendererSettings !== settings) {
        labRenderer = new Renderer(canvas, ctx);
        labRendererSettings = settings;
    }
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
    const canvas = state.labCanvas;
    const ctx = canvas.getContext("2d");
    const viewport = state.viewport;
    const showVignette = document.getElementById("showVignetteInput").checked;
    const showWalls = document.getElementById("showWallsInput").checked;
    const showPathDebug = document.getElementById("showPathDebugInput").checked;
    const prevProfileOverride = state.worldSurfaces.surfaceProfileOverride;
    state.worldSurfaces.surfaceProfileOverride = RUNTIME_LAB_PROFILE_ID;
    maybeClearProfileBakeCaches(state, RUNTIME_LAB_PROFILE_ID);
    getLabRenderer(canvas, ctx).renderSimulationScene(state, viewport);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#080a0e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    if (showWalls || showPathDebug) {
        ctx.save();
        viewport.apply(ctx);
        if (showPathDebug && state.mapPathDebugCache) drawMapPathDebugCache(ctx, state.mapPathDebugCache);
        if (showWalls && state.mapTopologyWallCache) {
            ctx.save();
            ctx.globalAlpha = 0.35;
            drawMapWallCache(ctx, state.mapTopologyWallCache);
            ctx.restore();
        }
        ctx.restore();
    }
    ctx.save();
    viewport.apply(ctx);
    sandboxController?.drawOverlay(ctx);
    ctx.restore();
    state.worldSurfaces.surfaceProfileOverride = prevProfileOverride;
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
    paintMapOverviewFrame(state);
}
/** @param {import("../state.js").TileLabGameState} state */
export function repaintUntilBakesDone(state) {
    if (bakeRepaintRaf != null) cancelAnimationFrame(bakeRepaintRaf);
    const tick = () => {
        drawLabFrame(state);
        if (state.worldSurfaces.hasPendingSurfaceBakes()) bakeRepaintRaf = requestAnimationFrame(tick);
        else bakeRepaintRaf = null;
    };
    if (state.worldSurfaces.hasPendingSurfaceBakes()) bakeRepaintRaf = requestAnimationFrame(tick);
}
