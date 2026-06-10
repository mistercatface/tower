import { listShippedSurfaceProfileIds } from "../../../Config/procedural/profiles.js";
import { applySquareCanvasResize } from "../../../Libraries/Canvas/index.js";
import { initResizer } from "./lab-shared.js";
import { initAnimationPreview, estimateAnimationPreviewHeight } from "./LabAnimationPreview.js";
import { initProfileEditor, buildProfileFromEditor } from "./profile/ProfileEditor.js";
import { applyLabCanvasSize } from "./labCanvas.js";
import { registerEditorProfiles, renderTilelabPreview, syncRuntimeLabProfile } from "./preview.js";
import { readControls, initPresetSelect, initToolbarDefaults, bindToolbarControls, rollRandomTilelabMap, syncPreviewZoomToStage } from "./toolbar.js";
import { mountLabViewport, refreshLabViewportControls } from "./labViewport.js";
import { TILELAB_UI_HTML } from "./shellHtml.js";
import { bindMapInspectorControls, syncMapInspectorAfterRegen } from "./mapInspector.js";
import { initMapTopologyInteractions } from "./mapInteractions.js";
import { destroyTilelabSandbox, mountTilelabSandbox } from "../world/tilelabSandbox.js";
import { bindViewModeControls } from "./viewMode.js";
/** @typedef {import("../../../Libraries/Canvas/squareCanvasResize.js").SquareCanvasResizeHandle} SquareCanvasResizeHandle */
let previewRefreshTimer = null;
let bakeRepaintRaf = null;
let bootstrapped = false;
/** @type {SquareCanvasResizeHandle | null} */
let animCanvasResize = null;
/** @type {SquareCanvasResizeHandle | null} */
let mapCanvasResize = null;
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
        if (state.worldSurfaces.hasPendingSurfaceBakes()) bakeRepaintRaf = requestAnimationFrame(tick);
        else bakeRepaintRaf = null;
    };
    bakeRepaintRaf = requestAnimationFrame(tick);
}
async function refreshPreview(state) {
    syncMapInspectorAfterRegen(state, () => renderTilelabPreview(state, readControls(state)));
    await registerEditorProfiles(state);
    renderTilelabPreview(state, readControls(state));
    runBakeRepaintLoop(state);
}
function attachGameCanvas(state) {
    const mapStage = document.getElementById("mapStage");
    const canvas = document.getElementById("gameCanvas");
    if (mapStage && canvas && canvas.parentElement !== mapStage) {
        mapStage.appendChild(canvas);
        canvas.id = "gameCanvas";
    }
    state.labCanvas = canvas ?? null;
}
/** @param {import("../state.js").TileLabGameState} state */
function refreshLabViewportLayout(state) {
    if (mapCanvasResize) mapCanvasResize.setSize(mapCanvasResize.getSize());
    if (animCanvasResize && state.labShowAnimationPreview) animCanvasResize.setSize(animCanvasResize.getSize());
    syncPreviewZoomToStage(state);
    renderTilelabPreview(state, readControls(state));
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
    void syncRuntimeLabProfile();
    const onLabViewChange = () => {
        renderTilelabPreview(state, readControls(state));
        if (state.worldSurfaces.hasPendingSurfaceBakes()) runBakeRepaintLoop(state);
    };
    mountLabViewport(state, onLabViewChange);
    bindViewModeControls(state, onLabViewChange, () => refreshLabViewportLayout(state));
    bindMapInspectorControls(state, () => renderTilelabPreview(state, readControls(state)));
    initMapTopologyInteractions(state, () => renderTilelabPreview(state, readControls(state)));
    mountTilelabSandbox(state, () => renderTilelabPreview(state, readControls(state)));
    bindToolbarControls({
        onRefresh: () => schedulePreviewRefresh(state, 0),
        onRandomMap: () => {
            rollRandomTilelabMap(state);
            schedulePreviewRefresh(state, 0);
        },
        onStageResize: () => {
            if (state.labCanvas) applyLabCanvasSize(state, state.labCanvas.width, state.labCanvas.height);
            syncPreviewZoomToStage(state);
            renderTilelabPreview(state, readControls(state));
        },
    });
    initToolbarDefaults(state);
    const animCanvas = document.getElementById("animationPreviewCanvas");
    animCanvasResize = applySquareCanvasResize(animCanvas, {
        host: document.getElementById("animationPreviewHost"),
        initialSize: 200,
        minSize: 128,
        maxSize: () => {
            if (!state.labShowAnimationPreview) return 128;
            const container = document.querySelector(".map-container");
            if (!container) return 512;
            const rect = container.getBoundingClientRect();
            const column = document.querySelector(".map-viewport-column");
            const zoom = document.getElementById("labZoomControl");
            const speed = document.getElementById("labSpeedControl");
            const gap = column ? parseFloat(getComputedStyle(column).gap) || 10 : 10;
            const controlsH = (zoom?.offsetHeight ?? 0) + (speed?.offsetHeight ?? 0) + gap * 2;
            const minMapH = 160;
            const animHeader = 30;
            const available = rect.height - controlsH - minMapH - gap * 3 - animHeader;
            return Math.max(128, Math.floor(Math.min(rect.width, available) - 8));
        },
    });
    if (animCanvas) initAnimationPreview(animCanvas, buildProfileFromEditor);
    mapCanvasResize = applySquareCanvasResize(document.getElementById("gameCanvas"), {
        host: document.getElementById("mapStage"),
        initialSize: 320,
        minSize: 160,
        maxSize: () => {
            const container = document.querySelector(".map-container");
            if (!container) return 1200;
            const rect = container.getBoundingClientRect();
            const column = document.querySelector(".map-viewport-column");
            const zoom = document.getElementById("labZoomControl");
            const speed = document.getElementById("labSpeedControl");
            const gap = column ? parseFloat(getComputedStyle(column).gap) || 10 : 10;
            const controlsH = (zoom?.offsetHeight ?? 0) + (speed?.offsetHeight ?? 0) + gap * 2;
            const animH = state.labShowAnimationPreview ? estimateAnimationPreviewHeight() + gap : 0;
            return Math.max(160, Math.floor(Math.min(rect.width, rect.height - controlsH - animH) - 8));
        },
        onResize: (size) => {
            applyLabCanvasSize(state, size, size);
            syncPreviewZoomToStage(state);
            renderTilelabPreview(state, readControls(state));
        },
    });
    initResizer("resizer", () => {
        if (state.labCanvas) applyLabCanvasSize(state, state.labCanvas.width, state.labCanvas.height);
        syncPreviewZoomToStage(state);
        renderTilelabPreview(state, readControls(state));
    });
    registerEditorProfiles(state).then(() => {
        syncPreviewZoomToStage(state);
        syncMapInspectorAfterRegen(state, () => renderTilelabPreview(state, readControls(state)));
        refreshPreview(state);
    });
}
export const tilelabUiPort = {
    mount({ state }) {
        const uiRoot = document.getElementById("ui-root");
        if (!uiRoot) throw new Error("tilelabUiPort: #ui-root missing");
        uiRoot.innerHTML = TILELAB_UI_HTML;
        attachGameCanvas(state);
        bootstrapTilelabUi(state);
    },
    unmount() {
        if (bakeRepaintRaf != null) cancelAnimationFrame(bakeRepaintRaf);
        destroyTilelabSandbox();
        animCanvasResize = null;
        mapCanvasResize = null;
        bootstrapped = false;
    },
    updateUI({ state }) {
        if (!bootstrapped) return;
        refreshLabViewportControls(state);
        renderTilelabPreview(state, readControls(state));
        if (state.worldSurfaces.hasPendingSurfaceBakes()) runBakeRepaintLoop(state);
    },
};
