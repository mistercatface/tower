/**
 * Tile Lab — procedural floor/wall profile editor and full-map preview.
 * Open via Tools/TileLab/index.html (local server required).
 */
import { listShippedFloorProfileIds } from "../../Config/floorProceduralConfig.js";
import { initMapPreviewNavigation, exportMapOverlayWebm } from "./map/LabMapPreview.js";
import { clearFlatWallFaceCache } from "../../Render/3D/WallFaceTexture.js";
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
import { exportOverlayPx } from "./LabSettings.js";
import { ensureLabWorld, getLabWorld, resetLabWorld } from "./LabWorldSession.js";
import { initProfileEditor, RUNTIME_LAB_PROFILE_ID } from "./profile/ProfileEditor.js";
import { getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";
import {
    drawInspectQuick,
    drawInspectAtFrame,
    inspectFrameIndexFromTime,
    isProfileAnimated,
    downloadInspectExport,
} from "./inspect/TileInspectBakes.js";

/** @type {ReturnType<typeof readControls> | null} */
let inspectCtrl = null;
let mapPreviewTimer = null;
let fullRenderTimer = null;
let inspectAnimTick = 0;
/** @type {string | null} */
let exportPreviewUrl = null;
/** @type {string | null} */
let exportPreviewFilename = null;

function switchToExportTab() {
    const buttons = document.querySelectorAll(".col-inspect .tab-btn");
    const panels = document.querySelectorAll(".col-inspect .tab-panel");
    buttons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === "export"));
    panels.forEach((panel) => panel.classList.toggle("active", panel.id === "tab-export"));
}

function clearExportPreview() {
    const group = document.getElementById("exportPreviewGroup");
    const video = document.getElementById("exportPreviewVideo");
    const downloadBtn = document.getElementById("exportDownloadBtn");
    if (exportPreviewUrl) {
        URL.revokeObjectURL(exportPreviewUrl);
        exportPreviewUrl = null;
    }
    exportPreviewFilename = null;
    if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
    }
    if (group) {
        group.hidden = true;
    }
    if (downloadBtn) {
        downloadBtn.hidden = true;
    }
}

function showExportPreview(blob, filename) {
    const group = document.getElementById("exportPreviewGroup");
    const video = document.getElementById("exportPreviewVideo");
    const downloadBtn = document.getElementById("exportDownloadBtn");
    if (!group || !video || !blob) {
        return;
    }
    if (exportPreviewUrl) {
        URL.revokeObjectURL(exportPreviewUrl);
    }
    exportPreviewUrl = URL.createObjectURL(blob);
    exportPreviewFilename = filename ?? "map-overlay.webm";
    video.src = exportPreviewUrl;
    group.hidden = false;
    if (downloadBtn) {
        downloadBtn.hidden = false;
    }
    switchToExportTab();
    video.play().catch(() => {});
}

function downloadExportPreview() {
    if (!exportPreviewUrl || !exportPreviewFilename) {
        return;
    }
    const link = document.createElement("a");
    link.download = exportPreviewFilename;
    link.href = exportPreviewUrl;
    link.click();
}

function updateExportTabUi() {
    const ctrl = inspectCtrl ?? readControls();
    const btn = document.getElementById("exportBtn");
    const hint = document.getElementById("exportFormatHint");
    const tileGroup = document.getElementById("exportTileGroup");
    const animated = isProfileAnimated(ctrl.profileId);
    if (tileGroup) {
        tileGroup.style.display = animated ? "none" : "block";
    }
    if (!animated) {
        clearExportPreview();
    }
    if (btn) {
        btn.textContent = animated ? "Bake WebM" : "Download PNG";
        btn.disabled = false;
    }
    const downloadBtn = document.getElementById("exportDownloadBtn");
    if (downloadBtn) {
        downloadBtn.hidden = !animated || !exportPreviewUrl;
    }
    if (hint) {
        if (animated) {
            const hasPreview = Boolean(exportPreviewUrl);
            hint.textContent = hasPreview
                ? "Preview ready below. Bake again to refresh, or download when you're happy with it."
                : `Bakes a ${exportOverlayPx}×${exportOverlayPx} circular overlay (no player dot) for preview.`;
        } else {
            hint.textContent = "Static tile — exports PNG from the selection above.";
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
            invalidateLabCaches();
            world.floorTiles.clear();
            renderMapPreview(ctrl, world, { fastNav: false });
        }
    }, 400);
}

async function renderLightweight() {
    registerEditorProfiles();

    const ctrl = readControls();
    inspectCtrl = ctrl;
    const world = getLabWorld();
    const frameIndex = inspectFrameIndexFromTime(ctrl.profileId, world?.gameTime ?? 0);
    await drawInspectQuick(ctrl, frameIndex);
    updateExportTabUi();
    scheduleMapPreview();
}

async function renderAll({ fullQuality = false } = {}) {
    registerEditorProfiles();

    const ctrl = readControls();
    const world = ensureLabWorld(ctrl);
    applyGameDefaultsToForm(world);

    invalidateLabCaches();
    world.floorTiles.clear();

    inspectCtrl = ctrl;
    const frameIndex = inspectFrameIndexFromTime(ctrl.profileId, world?.gameTime ?? 0);
    await drawInspectAtFrame(ctrl, frameIndex);
    updateExportTabUi();
    renderMapPreview(ctrl, world, { fastNav: false });
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
    const profile = getFloorProceduralProfile(RUNTIME_LAB_PROFILE_ID);

    if (profile?.animation) {
        if (btn) btn.disabled = true;
        registerEditorProfiles();
        const world = ensureLabWorld(ctrl);
        try {
            const result = await exportMapOverlayWebm(ctrl, world, RUNTIME_LAB_PROFILE_ID, {
                onProgress: (current, total, phase) => {
                    if (hint) {
                        hint.textContent = phase === "encode"
                            ? "Encoding WebM…"
                            : `Rendering frame ${current}/${total}…`;
                    }
                },
            });
            if (result?.ok && result.blob) {
                showExportPreview(result.blob, result.filename);
                if (hint) {
                    hint.textContent = "Preview ready below. Bake again to refresh, or download when you're happy with it.";
                }
            } else if (hint) {
                hint.textContent = "WebM export failed — try Chrome/Edge, or reduce frame count.";
            }
        } finally {
            world.floorTiles.clear();
            clearFlatWallFaceCache();
            invalidateLabCaches();
            renderMapPreview(ctrl, world, { fastNav: true });
            updateExportTabUi();
        }
        return;
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
document.getElementById("exportDownloadBtn")?.addEventListener("click", downloadExportPreview);
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
