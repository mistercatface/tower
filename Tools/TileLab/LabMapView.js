import { registerRuntimeFloorProfile } from "../../Config/floorProceduralConfig.js";
import { clearFlatWallFaceCache } from "../../Render/3D/WallFaceTexture.js";
import { TileWorkerCoordinator } from "../../Render/Floor/TileWorkerCoordinator.js";
import {
    renderGamePreview,
    prepareGameCanvas,
    invalidateMapPreviewBakes,
} from "./map/LabMapPreview.js";
import {
    getActiveLabProfile,
    getActiveLabMapProfile,
    RUNTIME_LAB_PROFILE_ID,
    RUNTIME_LAB_MAP_PROFILE_ID,
} from "./profile/ProfileEditor.js";
import { ensureLabWorld, getLabWorldMapSeed } from "./LabWorldSession.js";

export function registerEditorProfiles() {
    const labProfile = getActiveLabProfile();
    const mapProfile = getActiveLabMapProfile();
    
    registerRuntimeFloorProfile(RUNTIME_LAB_PROFILE_ID, labProfile);
    registerRuntimeFloorProfile(RUNTIME_LAB_MAP_PROFILE_ID, mapProfile);

    TileWorkerCoordinator.registerRuntimeProfile(RUNTIME_LAB_PROFILE_ID, labProfile);
    TileWorkerCoordinator.registerRuntimeProfile(RUNTIME_LAB_MAP_PROFILE_ID, mapProfile);
}

export function invalidateLabCaches() {
    clearFlatWallFaceCache();
    invalidateMapPreviewBakes();
}

function syncGameCanvasSize() {
    const stage = document.getElementById("mapStage");
    const canvas = document.getElementById("gamePreview");
    const size = prepareGameCanvas(canvas, stage);
    if (!size) {
        return null;
    }
    if (size.changed) {
        invalidateMapPreviewBakes();
    }
    return size;
}

export function renderMapPreview(ctrl, world) {
    const size = syncGameCanvasSize();
    if (!size) {
        return;
    }
    renderGamePreview(document.getElementById("gamePreview"), {
        worldState: world,
        profileId: RUNTIME_LAB_MAP_PROFILE_ID,
        gameZoom: ctrl.gameZoom,
        showRangeRing: ctrl.showRangeRing,
        weaponRange: ctrl.weaponRange,
        viewWidth: size.width,
        viewHeight: size.height,
        showVignette: ctrl.showVignette,
    });
    const gameMeta = document.getElementById("gameMetaLine");
    if (gameMeta && world) {
        const node = world.getCurrentMapNode();
        gameMeta.textContent =
            `node ${world.currentNodeId} ${node?.strategy ?? ""} · map ${getLabWorldMapSeed()} · ` +
            `player ${Math.round(world.player.x)},${Math.round(world.player.y)} · ` +
            `zoom ${ctrl.gameZoom.toFixed(2)} · range ${ctrl.weaponRange} · WASD`;
    }
}

export function runMapPreviewPass(readControls) {
    registerEditorProfiles();
    const ctrl = readControls();
    const world = ensureLabWorld(ctrl);
    if (world) {
        renderMapPreview(ctrl, world);
    }
}
