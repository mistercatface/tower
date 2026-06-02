import { floorProceduralProfiles } from "../../Config/floorProceduralConfig.js";
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
import { initProfileEditor } from "./profile/ProfileEditor.js";
import {
    renderTileInspectPreviews,
    downloadInspectExport,
} from "./inspect/TileInspectBakes.js";

const PROFILE_IDS = Object.keys(floorProceduralProfiles)
    .filter((id) => !id.startsWith("__lab"))
    .sort();

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

initPresetSelect(PROFILE_IDS);
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

requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        renderAll();
        syncCombatZoomToStage(getLabWorld());
    });
});
