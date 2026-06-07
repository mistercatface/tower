import { registerRuntimeSurfaceProfile } from "../../../Config/procedural/profiles.js";
import { getSurfaceProfileProvider } from "../../../Libraries/Procedural/SurfaceProfileProvider.js";
import { invalidateProfileScratch } from "../../../Libraries/WorldSurface/ProfileBakeResolver.js";
import { TileWorkerCoordinator } from "../../../Libraries/WorldSurface/TileWorkerCoordinator.js";
import { invalidateWallAtlasKeyMemos } from "../../../Render/game/wallSurfaceInvalidation.js";
import { getLabFocus } from "../world/mapFocus.js";
import { drawTilelabSurfaceFrame, invalidateMapPreviewBakes, prepareGameCanvas } from "../world/surfacePreview.js";
import { getLabPreviewProfile, RUNTIME_LAB_PROFILE_ID } from "./profile/ProfileEditor.js";

let registerEditorProfilesSerial = Promise.resolve();

/** Sync path — must run before the game loop can draw `__labA__`. */
export function syncRuntimeLabProfile() {
    registerRuntimeSurfaceProfile(RUNTIME_LAB_PROFILE_ID, getLabPreviewProfile());
}

export function registerEditorProfiles(state) {
    registerEditorProfilesSerial = registerEditorProfilesSerial.then(async () => {
        const labProfile = getLabPreviewProfile();
        syncRuntimeLabProfile();
        invalidateProfileScratch(RUNTIME_LAB_PROFILE_ID);
        if (state?.worldSurfaces) {
            invalidateWallAtlasKeyMemos(state);
            state.worldSurfaces.clear();
        }
        invalidateMapPreviewBakes();
        await TileWorkerCoordinator.registerRuntimeProfile(RUNTIME_LAB_PROFILE_ID, labProfile);
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
    drawTilelabSurfaceFrame(canvas.getContext("2d"), canvas, state, RUNTIME_LAB_PROFILE_ID, ctrl.gameZoom, ctrl.weaponRange, {
        showVignette: ctrl.showVignette,
        showRangeRing: ctrl.showRangeRing,
        viewW: size.width,
        viewH: size.height,
    });
    const gameMeta = document.getElementById("gameMetaLine");
    if (gameMeta) {
        const node = state.getCurrentMapNode();
        const focus = getLabFocus(state);
        gameMeta.textContent =
            `node ${state.currentNodeId} ${node?.strategy ?? ""} · map ${state.mapSeed} · ` +
            `focus ${Math.round(focus.x)},${Math.round(focus.y)} · ` +
            `zoom ${ctrl.gameZoom.toFixed(2)} · range ${ctrl.weaponRange} · WASD`;
    }
}
