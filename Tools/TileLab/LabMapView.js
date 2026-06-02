import { registerRuntimeFloorProfile } from "../../Config/floorProceduralConfig.js";
import { clearFlatWallFaceCache } from "../../Render/3D/WallFaceTexture.js";
import {
    renderGamePreview,
    prepareGameCanvas,
    invalidateMapPreviewBakes,
    requestNavMapRender,
    requestQualityMapRender,
} from "./map/LabMapPreview.js";
import { getActiveLabProfiles, LAB_PROFILE_A } from "./profile/ProfileEditor.js";
import { ensureLabWorld, getLabWorldMapSeed } from "./LabWorldSession.js";

export function registerEditorProfiles() {
    const { profileA } = getActiveLabProfiles();
    registerRuntimeFloorProfile(LAB_PROFILE_A, profileA);
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

export function renderMapPreview(ctrl, world, { fastNav = false } = {}) {
    const size = syncGameCanvasSize();
    if (!size) {
        return;
    }
    renderGamePreview(document.getElementById("gamePreview"), {
        worldState: world,
        profileId: LAB_PROFILE_A,
        gameZoom: ctrl.gameZoom,
        showRangeRing: ctrl.showRangeRing,
        weaponRange: ctrl.weaponRange,
        viewWidth: size.width,
        viewHeight: size.height,
        fastNav,
    });
    const gameMeta = document.getElementById("gameMetaLine");
    if (gameMeta && world) {
        const node = world.getCurrentMapNode();
        const mode = fastNav ? "move" : "full";
        gameMeta.textContent =
            `node ${world.currentNodeId} ${node?.strategy ?? ""} · map ${getLabWorldMapSeed()} · ` +
            `player ${Math.round(world.player.x)},${Math.round(world.player.y)} · ` +
            `zoom ${ctrl.gameZoom.toFixed(2)} · range ${ctrl.weaponRange} · ${mode} · WASD`;
    }
}

export function runMapPreviewPass(readControls, { fastNav = false } = {}) {
    registerEditorProfiles();
    const ctrl = readControls();
    const world = ensureLabWorld(ctrl);
    if (world) {
        renderMapPreview(ctrl, world, { fastNav });
    }
}

export function handleMapNavChange(reason, readControls) {
    if (reason === "idle-quality" || reason === "zoom") {
        requestQualityMapRender(({ fastNav }) => runMapPreviewPass(readControls, { fastNav }));
        return;
    }
    requestNavMapRender(({ fastNav }) => runMapPreviewPass(readControls, { fastNav }));
}
