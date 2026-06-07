import { listShippedSurfaceProfileIds } from "../../../Config/procedural/profiles.js";
import { getUiRoot } from "../../../UI/Core/uiRoot.js";
import { initResizer } from "../../../Tools/Lab/lab-shared.js";
import { initAnimationPreview } from "./LabAnimationPreview.js";
import { initProfileEditor, buildProfileFromEditor } from "./profile/ProfileEditor.js";
import { initMapPreviewNavigation } from "../world/surfacePreview.js";
import { registerEditorProfiles, renderTilelabPreview, syncRuntimeLabProfile } from "./preview.js";
import {
    readControls,
    applyToolbarDefaults,
    initPresetSelect,
    initToolbarDefaults,
    bindToolbarControls,
    syncTilelabWorld,
    syncPreviewZoomToStage,
} from "./toolbar.js";
import { TILELAB_UI_HTML } from "./shellHtml.js";

/** @typedef {import("../../../Core/GameDefinitionTypes.js").UiPort} UiPort */

let previewRefreshTimer = null;
let bakeRepaintRaf = null;
let bootstrapped = false;

function schedulePreviewRefresh(state, debounceMs) {
    if (previewRefreshTimer != null) clearTimeout(previewRefreshTimer);
    const run = () => refreshPreview(state);
    if (debounceMs <= 0) {
        run();
        return;
    }
    previewRefreshTimer = setTimeout(() => {
        previewRefreshTimer = null;
        run();
    }, debounceMs);
}

function runBakeRepaintLoop(state) {
    if (bakeRepaintRaf != null) cancelAnimationFrame(bakeRepaintRaf);
    const tick = () => {
        renderTilelabPreview(state, readControls(state));
        if (state.worldSurfaces?.hasPendingSurfaceBakes?.()) bakeRepaintRaf = requestAnimationFrame(tick);
        else bakeRepaintRaf = null;
    };
    bakeRepaintRaf = requestAnimationFrame(tick);
}

async function refreshPreview(state) {
    const ctrl = readControls(state);
    syncTilelabWorld(state, ctrl);
    state.worldSurfaces.clear();
    await registerEditorProfiles(state);
    renderTilelabPreview(state, ctrl);
    runBakeRepaintLoop(state);
}

function attachGameCanvas() {
    const mapStage = document.getElementById("mapStage");
    const canvas = document.getElementById("gameCanvas");
    if (mapStage && canvas && canvas.parentElement !== mapStage) {
        mapStage.appendChild(canvas);
        canvas.id = "gameCanvas";
    }
}

function bootstrapTilelabUi(state) {
    if (bootstrapped) return;
    bootstrapped = true;
    initPresetSelect(listShippedSurfaceProfileIds());
    initProfileEditor({
        onChange: (options = {}) => {
            if (options.reloadProfile) schedulePreviewRefresh(state, 0);
            else if (options.lightweight) schedulePreviewRefresh(state, 150);
            else schedulePreviewRefresh(state, 300);
        },
    });
    syncRuntimeLabProfile();
    initMapPreviewNavigation(() => ({ ...readControls(state), worldState: state }), {
        onViewChange: () => {
            renderTilelabPreview(state, readControls(state));
            if (state.worldSurfaces?.hasPendingSurfaceBakes?.()) runBakeRepaintLoop(state);
        },
    });
    bindToolbarControls({
        onRefresh: () => schedulePreviewRefresh(state, 0),
        onRegenMap: () => syncTilelabWorld(state, readControls(state), true),
        onStageResize: () => {
            applyToolbarDefaults();
            syncPreviewZoomToStage();
            renderTilelabPreview(state, readControls(state));
        },
    });
    initToolbarDefaults();
    initResizer("resizer", () => {
        applyToolbarDefaults();
        syncPreviewZoomToStage();
        renderTilelabPreview(state, readControls(state));
    });
    const animCanvas = document.getElementById("animationPreviewCanvas");
    if (animCanvas) initAnimationPreview(animCanvas, buildProfileFromEditor);
    registerEditorProfiles(state).then(() => {
        applyToolbarDefaults();
        syncPreviewZoomToStage();
        refreshPreview(state);
    });
}

/** @type {UiPort} */
export const tilelabUiPort = {
    mount({ state }) {
        const uiRoot = getUiRoot();
        if (!uiRoot) throw new Error("tilelabUiPort: #ui-root missing");
        uiRoot.innerHTML = TILELAB_UI_HTML;
        attachGameCanvas();
        bootstrapTilelabUi(state);
    },
    unmount() {
        if (bakeRepaintRaf != null) cancelAnimationFrame(bakeRepaintRaf);
        bootstrapped = false;
    },
    updateHud() {},
    updateUI({ state }) {
        if (!bootstrapped) return;
        renderTilelabPreview(state, readControls(state));
        if (state.worldSurfaces?.hasPendingSurfaceBakes?.()) runBakeRepaintLoop(state);
    },
};
