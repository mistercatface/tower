import { registerRuntimeFloorProfile } from "../../Config/floorProceduralConfig.js";
import { invalidateProfileScratch } from "../../Render/Floor/ProfileBakeResolver.js";
import { TileWorkerCoordinator } from "../../Render/Floor/TileWorkerCoordinator.js";
import {
    renderGamePreview,
    prepareGameCanvas,
    invalidateMapPreviewBakes,
} from "./map/LabMapPreview.js";
import { getLabPreviewProfile, RUNTIME_LAB_PROFILE_ID } from "./profile/ProfileEditor.js";
import { ensureLabWorld, getLabWorld, getLabWorldMapSeed } from "./LabWorldSession.js";
import { invalidateWallSurfaceKeyMemos } from "../../Render/Floor/FloorTileSystem.js";

let registerEditorProfilesSerial = Promise.resolve();

export function registerEditorProfiles() {
    registerEditorProfilesSerial = registerEditorProfilesSerial.then(async () => {
        const labProfile = getLabPreviewProfile();
        registerRuntimeFloorProfile(RUNTIME_LAB_PROFILE_ID, labProfile);
        invalidateProfileScratch(RUNTIME_LAB_PROFILE_ID);
        const world = getLabWorld();
        if (world?.floorTiles) {
            invalidateWallSurfaceKeyMemos(world);
            world.floorTiles.clear();
        }
        invalidateMapPreviewBakes();

        await TileWorkerCoordinator.registerRuntimeProfile(RUNTIME_LAB_PROFILE_ID, labProfile);
    });
    return registerEditorProfilesSerial;
}

export function invalidateLabCaches() {
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
        profileId: RUNTIME_LAB_PROFILE_ID,
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

export async function runMapPreviewPass(readControls) {
    await registerEditorProfiles();
    const ctrl = readControls();
    const world = ensureLabWorld(ctrl);
    if (world) {
        renderMapPreview(ctrl, world);
    }
}
