/**
 * Tile Lab — procedural floor/wall profile editor and full-map preview.
 * Open via Tools/TileLab/index.html (local server required).
 */
import { listShippedFloorProfileIds } from "../../Config/floorProceduralConfig.js";
import { initMapPreviewNavigation } from "./map/LabMapPreview.js";
import {
    invalidateLabCaches,
    registerEditorProfiles,
    renderMapPreview,
    handleMapNavChange,
} from "./LabMapView.js";
import {
    readControls,
    applyGameDefaultsToForm,
    syncCombatZoomToStage,
    initPresetSelect,
    initInspectTabs,
    initToolbarDefaults,
    bindToolbarControls,
} from "./LabToolbar.js";
import { ensureLabWorld, getLabWorld, resetLabWorld } from "./LabWorldSession.js";
import { initProfileEditor, RUNTIME_LAB_PROFILE_ID } from "./profile/ProfileEditor.js";
import { getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";
import {
    drawInspectQuick,
    drawInspectAtFrame,
    inspectFrameIndexFromTime,
    isAnimatedExportTarget,
    downloadInspectExport,
} from "./inspect/TileInspectBakes.js";

/** @type {ReturnType<typeof readControls> | null} */
let inspectCtrl = null;
let mapPreviewTimer = null;
let fullRenderTimer = null;
let inspectAnimTick = 0;

function updateExportTabUi() {
    const ctrl = inspectCtrl ?? readControls();
    const pick = document.getElementById("exportTarget")?.value ?? "floor";
    const btn = document.getElementById("exportBtn");
    const hint = document.getElementById("exportFormatHint");
    const animated = isAnimatedExportTarget(ctrl, pick);
    if (btn) {
        btn.textContent = animated ? "Download WebM" : "Download PNG";
        btn.disabled = false;
    }
    if (hint) {
        if (animated) {
            const frames = getFloorProceduralProfile(ctrl.profileId)?.animation?.frames ?? 0;
            hint.textContent = `Animated (${frames} frames) — WebM bakes on download. Map preview stays static.`;
        } else {
            hint.textContent = "Static tile — exports PNG.";
        }
    }
}

function scheduleMapPreview() {
    if (mapPreviewTimer != null) {
        clearTimeout(mapPreviewTimer);
    }
    mapPreviewTimer = setTimeout(() => {
        mapPreviewTimer = null;
        const ctrl = readControls();
        const world = getLabWorld() ?? ensureLabWorld(ctrl);
        if (world) {
            world.floorTiles.clear();
            renderMapPreview(ctrl, world, { fastNav: true });
        }
    }, 400);
}

function renderLightweight() {
    registerEditorProfiles();

    const ctrl = readControls();
    inspectCtrl = ctrl;
    const world = getLabWorld();
    const frameIndex = inspectFrameIndexFromTime(ctrl.profileId, world?.gameTime ?? 0);
    drawInspectQuick(ctrl, frameIndex);
    updateExportTabUi();
    scheduleMapPreview();
}

function renderAll({ fullQuality = false } = {}) {
    registerEditorProfiles();

    const ctrl = readControls();
    const world = ensureLabWorld(ctrl);
    applyGameDefaultsToForm(world);

    if (fullQuality) {
        invalidateLabCaches();
    } else {
        world.floorTiles.clear();
    }

    inspectCtrl = ctrl;
    const frameIndex = inspectFrameIndexFromTime(ctrl.profileId, world?.gameTime ?? 0);
    drawInspectAtFrame(ctrl, frameIndex);
    updateExportTabUi();
    renderMapPreview(ctrl, world, { fastNav: !fullQuality });
}

function scheduleFullRender() {
    if (fullRenderTimer != null) {
        clearTimeout(fullRenderTimer);
    }
    fullRenderTimer = setTimeout(() => {
        fullRenderTimer = null;
        renderAll({ fullQuality: false });
    }, 300);
}

function handleEditorChange(options = {}) {
    if (options.lightweight) {
        renderLightweight();
        return;
    }
    scheduleFullRender();
}

async function exportActive() {
    const ctrl = inspectCtrl ?? readControls();
    const pick = document.getElementById("exportTarget").value;
    const btn = document.getElementById("exportBtn");
    const hint = document.getElementById("exportFormatHint");
    if (isAnimatedExportTarget(ctrl, pick) && btn) {
        btn.disabled = true;
        if (hint) {
            hint.textContent = "Baking frames for WebM…";
        }
    }
    try {
        await downloadInspectExport(ctrl, pick);
    } finally {
        updateExportTabUi();
    }
}

function onStageResize() {
    applyGameDefaultsToForm(getLabWorld());
    syncCombatZoomToStage(getLabWorld());
    handleMapNavChange("idle-quality", readControls);
}

initPresetSelect(listShippedFloorProfileIds());
initInspectTabs();
initProfileEditor({ onChange: handleEditorChange });
initMapPreviewNavigation(
    () => ({ ...readControls(), worldState: getLabWorld() }),
    (reason) => handleMapNavChange(reason, readControls)
);
bindToolbarControls({
    onRender: () => renderAll({ fullQuality: true }),
    onExport: exportActive,
    onResetMap: resetLabWorld,
    onStageResize,
});
document.getElementById("exportTarget")?.addEventListener("change", updateExportTabUi);
initToolbarDefaults();

function bootstrap() {
    registerEditorProfiles();
    inspectCtrl = readControls();
    drawInspectQuick(inspectCtrl, 0);
    updateExportTabUi();

    requestAnimationFrame(() => {
        const ctrl = readControls();
        const world = ensureLabWorld(ctrl);
        applyGameDefaultsToForm(world);
        renderMapPreview(ctrl, world, { fastNav: true });
        syncCombatZoomToStage(world);
        requestAnimationFrame(appLoop);
    });
}

let lastRafTime = 0;
function appLoop(timestamp) {
    if (lastRafTime === 0) lastRafTime = timestamp;
    const dt = timestamp - lastRafTime;
    lastRafTime = timestamp;

    const profile = getFloorProceduralProfile(RUNTIME_LAB_PROFILE_ID);
    if (profile?.animation && inspectCtrl) {
        inspectAnimTick += dt;
        if (inspectAnimTick >= 120) {
            inspectAnimTick = 0;
            const world = getLabWorld();
            const frameIndex = inspectFrameIndexFromTime(
                RUNTIME_LAB_PROFILE_ID,
                world?.gameTime ?? 0
            );
            if (world) {
                world.gameTime = (world.gameTime || 0) + 120;
            }
            drawInspectQuick(inspectCtrl, frameIndex);
        }
    }

    requestAnimationFrame(appLoop);
}

bootstrap();
