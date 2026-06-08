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
/**
 * @param {import("../TileLabGameState.js").TileLabGameState} state
 * @param {ReturnType<import("./toolbar.js").readControls>} ctrl
 */
export function renderTilelabPreview(state, ctrl) {
    if (!getSurfaceProfileProvider().hasProfile(RUNTIME_LAB_PROFILE_ID)) return;
    const stage = document.getElementById("mapStage");
    const canvas = document.getElementById("gameCanvas");
    const size = prepareGameCanvas(canvas, stage);
    if (!size || !canvas) return;
    drawTilelabSurfaceFrame(canvas.getContext("2d"), canvas, state, RUNTIME_LAB_PROFILE_ID, ctrl.weaponRange, {
        showVignette: ctrl.showVignette,
        showRangeRing: ctrl.showRangeRing,
        mapLab: state.labShowTopologyOverlay ? state.mapLab : null,
        topologyOptions: state.labShowTopologyOverlay ? readMapControls() : null,
    });
    const gameMeta = document.getElementById("gameMetaLine");
    if (gameMeta) {
        const node = state.getCurrentMapNode();
        const { mapViewport } = state;
        gameMeta.textContent =
            `node ${state.currentNodeId} ${node?.strategy ?? ""} · map ${state.mapSeed} · ` +
            `focus ${Math.round(mapViewport.x)},${Math.round(mapViewport.y)} · ` +
            `zoom ${mapViewport.zoom.toFixed(2)} · range ${ctrl.weaponRange} · WASD`;
    }
}
