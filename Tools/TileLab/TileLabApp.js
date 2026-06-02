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
import { initProfileEditor, RUNTIME_LAB_PROFILE_ID, getActiveLabProfile } from "./profile/ProfileEditor.js";
import { getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";
import {
    renderTileInspectPreviews,
    drawInspectPreviews,
    inspectFrameIndexFromTime,
    isAnimatedInspectSource,
    downloadInspectExport,
} from "./inspect/TileInspectBakes.js";

/** @type {ReturnType<typeof renderTileInspectPreviews> | null} */
let inspectSources = null;
/** @type {ReturnType<typeof readControls> | null} */
let inspectCtrl = null;

function updateExportTabUi() {
    const pick = document.getElementById("exportTarget")?.value ?? "floor";
    const btn = document.getElementById("exportBtn");
    const hint = document.getElementById("exportFormatHint");
    const animated = isAnimatedInspectSource(inspectSources, pick);
    if (btn) {
        btn.textContent = animated ? "Download WebM" : "Download PNG";
    }
    if (hint) {
        if (animated) {
            const frames = inspectSources[pick].length;
            hint.textContent = `Animated (${frames} frames) — exports WebM at 30 fps.`;
        } else {
            const profile = getActiveLabProfile();
            hint.textContent = profile?.animation
                ? "Animation is off for this target, or only 1 frame — exports PNG."
                : "Static tile — exports PNG. Enable animation in Global tab to export WebM.";
        }
    }
}

function renderAll() {
    registerEditorProfiles();
    invalidateLabCaches();

    const ctrl = readControls();
    const world = ensureLabWorld(ctrl);
    applyGameDefaultsToForm(world);

    inspectCtrl = ctrl;
    inspectSources = renderTileInspectPreviews(ctrl, world?.gameTime ?? 0);
    updateExportTabUi();
    renderMapPreview(ctrl, world);
}

function exportActive() {
    downloadInspectExport(inspectSources, document.getElementById("exportTarget").value);
}

function onStageResize() {
    applyGameDefaultsToForm(getLabWorld());
    syncCombatZoomToStage(getLabWorld());
    handleMapNavChange("idle-quality", readControls);
}

initPresetSelect(listShippedFloorProfileIds());
initInspectTabs();
initProfileEditor({ onChange: renderAll });
initMapPreviewNavigation(
    () => ({ ...readControls(), worldState: getLabWorld() }),
    (reason) => handleMapNavChange(reason, readControls)
);
bindToolbarControls({
    onRender: renderAll,
    onExport: exportActive,
    onResetMap: resetLabWorld,
    onStageResize,
});
document.getElementById("exportTarget")?.addEventListener("change", updateExportTabUi);
initToolbarDefaults();

let lastRafTime = 0;
function appLoop(timestamp) {
    if (lastRafTime === 0) lastRafTime = timestamp;
    const dt = timestamp - lastRafTime;
    lastRafTime = timestamp;

    const profile = getFloorProceduralProfile(RUNTIME_LAB_PROFILE_ID);
    if (profile?.animation) {
        const world = getLabWorld();
        if (world && inspectSources && inspectCtrl) {
            world.gameTime = (world.gameTime || 0) + dt;
            const frameIndex = inspectFrameIndexFromTime(RUNTIME_LAB_PROFILE_ID, world.gameTime);
            drawInspectPreviews(inspectSources, inspectCtrl, frameIndex);
            renderMapPreview(inspectCtrl, world);
        }
    }

    requestAnimationFrame(appLoop);
}

requestAnimationFrame(() => {
    requestAnimationFrame((timestamp) => {
        lastRafTime = timestamp;
        renderAll();
        syncCombatZoomToStage(getLabWorld());
        requestAnimationFrame(appLoop);
    });
});
