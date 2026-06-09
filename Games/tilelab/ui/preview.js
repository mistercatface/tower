import { registerRuntimeSurfaceProfile } from "../../../Config/procedural/profiles.js";
import { getSurfaceProfileProvider } from "../../../Libraries/Procedural/SurfaceProfileProvider.js";
import { invalidateProfileScratch } from "../../../Libraries/WorldSurface/ProfileBakeResolver.js";
import { TileWorkerCoordinator } from "../../../Libraries/WorldSurface/TileWorkerCoordinator.js";
import { invalidateWallAtlasKeyMemos } from "../../../Render/game/wallSurfaceInvalidation.js";
import { readMapControls } from "./mapInspector.js";
import { prepareGameCanvas } from "./labCanvas.js";
import { drawTilelabSurfaceFrame, invalidateMapPreviewBakes } from "../world/surfacePreview.js";
import { getLabPreviewProfile, RUNTIME_LAB_PROFILE_ID } from "./profile/ProfileEditor.js";
let registerEditorProfilesSerial = Promise.resolve();
/** Sync path — must run before the game loop can draw `__labA__`. */
export function syncRuntimeLabProfile() {
    const profile = getLabPreviewProfile();
    registerRuntimeSurfaceProfile(RUNTIME_LAB_PROFILE_ID, profile);
    return TileWorkerCoordinator.registerRuntimeProfile(RUNTIME_LAB_PROFILE_ID, profile);
}
export function registerEditorProfiles(state) {
    registerEditorProfilesSerial = registerEditorProfilesSerial.then(async () => {
        invalidateProfileScratch(RUNTIME_LAB_PROFILE_ID);
        if (state?.worldSurfaces) {
            invalidateWallAtlasKeyMemos(state);
            state.worldSurfaces.clear();
        }
        invalidateMapPreviewBakes();
        await syncRuntimeLabProfile();
    });
    return registerEditorProfilesSerial;
}
let cachedStage = null;
let cachedCanvas = null;
/**
 * @param {import("../index.js").TileLabGameState} state
 * @param {ReturnType<import("./toolbar.js").readControls>} ctrl
 */
export function renderTilelabPreview(state, ctrl) {
    if (!getSurfaceProfileProvider().hasProfile(RUNTIME_LAB_PROFILE_ID)) return;
    if (!cachedStage) cachedStage = document.getElementById("mapStage");
    if (!cachedCanvas) cachedCanvas = document.getElementById("gameCanvas");
    const size = prepareGameCanvas(cachedCanvas, cachedStage);
    if (!size || !cachedCanvas) return;
    drawTilelabSurfaceFrame(cachedCanvas.getContext("2d"), cachedCanvas, state, RUNTIME_LAB_PROFILE_ID, {
        showVignette: ctrl.showVignette,
        topologySession: state.labShowTopologyOverlay ? state.roguelikeMapSession : null,
        topologyOptions: state.labShowTopologyOverlay ? readMapControls() : null,
    });
}
