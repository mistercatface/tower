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
    renderTileInspectPreviews,
    downloadInspectExport,
} from "./inspect/TileInspectBakes.js";

/** @type {ReturnType<typeof renderTileInspectPreviews> | null} */
let inspectSources = null;

function renderAll() {
    registerEditorProfiles();
    invalidateLabCaches();

    const ctrl = readControls();
    const world = ensureLabWorld(ctrl);
    applyGameDefaultsToForm(world);

    inspectSources = renderTileInspectPreviews(ctrl);
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
initToolbarDefaults();

let lastRafTime = 0;
function appLoop(timestamp) {
    if (lastRafTime === 0) lastRafTime = timestamp;
    const dt = timestamp - lastRafTime;
    lastRafTime = timestamp;

    const profile = getFloorProceduralProfile(RUNTIME_LAB_PROFILE_ID);
    if (profile && profile.animation) {
        const world = getLabWorld();
        if (world) {
            world.gameTime = (world.gameTime || 0) + dt;
            renderMapPreview(readControls(), world);
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
