import { registerRuntimeSurfaceProfile } from "../../../Config/procedural/profiles.js";
import { invalidateProfileScratch } from "../../../Libraries/WorldSurface/ProfileBakeResolver.js";
import { TileWorkerCoordinator } from "../../../Libraries/WorldSurface/TileWorkerCoordinator.js";
import { invalidateWallAtlasKeyMemos } from "../../../Render/game/wallSurfaceInvalidation.js";
import { drawTilelabSurfaceFrame, invalidateMapPreviewBakes } from "../world/surfacePreview.js";
import { buildProfileFromEditor, RUNTIME_LAB_PROFILE_ID } from "./profile/ProfileEditor.js";
let registerEditorProfilesSerial = Promise.resolve();
function buildLabRuntimeProfile() {
    const profile = buildProfileFromEditor();
    if (profile?.animation) delete profile.animation;
    return profile;
}
export function registerEditorProfiles(state) {
    registerRuntimeSurfaceProfile(RUNTIME_LAB_PROFILE_ID, buildLabRuntimeProfile());
    registerEditorProfilesSerial = registerEditorProfilesSerial.then(async () => {
        invalidateProfileScratch(RUNTIME_LAB_PROFILE_ID);
        invalidateWallAtlasKeyMemos(state);
        state.worldSurfaces.clearBakeCache();
        invalidateMapPreviewBakes();
        const profile = buildLabRuntimeProfile();
        registerRuntimeSurfaceProfile(RUNTIME_LAB_PROFILE_ID, profile);
        await TileWorkerCoordinator.registerRuntimeProfile(RUNTIME_LAB_PROFILE_ID, profile);
    });
    return registerEditorProfilesSerial;
}
/** @param {import("../state.js").TileLabGameState} state */
export function renderTilelabPreview(state) {
    const canvas = state.labCanvas;
    drawTilelabSurfaceFrame(canvas.getContext("2d"), canvas, state, RUNTIME_LAB_PROFILE_ID, {
        showVignette: document.getElementById("showVignetteInput").checked,
        topologySession: state.labShowTopologyOverlay ? state.roguelikeMapSession : null,
        topologyOptions: state.labShowTopologyOverlay
            ? {
                  showNodes: document.getElementById("showNodesInput").checked,
                  showRoomZones: document.getElementById("showRoomZonesInput").checked,
                  showWalls: document.getElementById("showWallsInput").checked,
                  showGridBounds: document.getElementById("showGridBoundsInput").checked,
                  showPathDebug: document.getElementById("showPathDebugInput").checked,
              }
            : null,
    });
}
