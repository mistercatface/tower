import { registerRuntimeSurfaceProfile } from "../../../Config/procedural/profiles.js";
import { invalidateProfileScratch } from "../../../Libraries/WorldSurface/ProfileBakeResolver.js";
import { TileWorkerCoordinator } from "../../../Libraries/WorldSurface/TileWorkerCoordinator.js";
import { drawTopologyLayer } from "../../../Libraries/Render/map/topology/index.js";
import { invalidateWallAtlasKeyMemos } from "../../../Render/game/wallSurfaceInvalidation.js";
import { drawTilelabSurfaceFrame, invalidateMapPreviewBakes } from "../world/surfacePreview.js";
import { buildProfileFromEditor, RUNTIME_LAB_PROFILE_ID } from "./profile/ProfileEditor.js";
function buildLabRuntimeProfile() {
    const profile = buildProfileFromEditor();
    if (profile?.animation) delete profile.animation;
    return profile;
}
/** @param {import("../state.js").TileLabGameState} state */
export function syncEditorProfile(state) {
    invalidateProfileScratch(RUNTIME_LAB_PROFILE_ID);
    invalidateWallAtlasKeyMemos(state);
    state.worldSurfaces.clearBakeCache();
    invalidateMapPreviewBakes();
    const profile = buildLabRuntimeProfile();
    registerRuntimeSurfaceProfile(RUNTIME_LAB_PROFILE_ID, profile);
    void TileWorkerCoordinator.registerRuntimeProfile(RUNTIME_LAB_PROFILE_ID, profile);
}
/** @param {import("../state.js").TileLabGameState} state */
export function renderTilelabPreview(state) {
    const canvas = state.labCanvas;
    const showWalls = document.getElementById("showWallsInput").checked;
    const showPathDebug = document.getElementById("showPathDebugInput").checked;
    drawTilelabSurfaceFrame(canvas.getContext("2d"), canvas, state, RUNTIME_LAB_PROFILE_ID, {
        showVignette: document.getElementById("showVignetteInput").checked,
        debugOverlay: showWalls || showPathDebug ? { showWalls, showPathDebug } : null,
    });
}
