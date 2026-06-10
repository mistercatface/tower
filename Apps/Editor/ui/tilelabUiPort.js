import { listShippedSurfaceProfileIds } from "../../../Config/procedural/profiles.js";
import { applySquareCanvasResize } from "../../../Libraries/Canvas/index.js";
import { initResizer } from "./lab-shared.js";
import { initAnimationPreview, estimateAnimationPreviewHeight } from "./LabAnimationPreview.js";
import { initProfileEditor, buildProfileFromEditor } from "./profile/ProfileEditor.js";
import { registerEditorProfiles, renderTilelabPreview } from "./preview.js";
import { initPresetSelect, bindToolbarControls, rollRandomTilelabMap } from "./toolbar.js";
import { fitLabStageToView, mountLabViewport } from "./labViewport.js";
import { TILELAB_UI_HTML } from "./shellHtml.js";
import { buildTopologySettingsPanel, syncMapInspectorAfterRegen } from "./mapInspector.js";
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
/** @type {ReturnType<typeof mountLabViewport> | null} */
let labViewport = null;
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
        renderTilelabPreview(state);
        if (state.worldSurfaces.hasPendingSurfaceBakes()) bakeRepaintRaf = requestAnimationFrame(tick);
        else bakeRepaintRaf = null;
    };
    bakeRepaintRaf = requestAnimationFrame(tick);
}
async function refreshPreview(state) {
    syncMapInspectorAfterRegen(state, () => renderTilelabPreview(state));
    await registerEditorProfiles(state);
    renderTilelabPreview(state);
    runBakeRepaintLoop(state);
}
function attachGameCanvas(state) {
    const mapStage = document.getElementById("mapStage");
    const canvas = document.getElementById("gameCanvas");
    if (canvas.parentElement !== mapStage) mapStage.appendChild(canvas);
    state.labCanvas = canvas;
}
/** @param {import("../state.js").TileLabGameState} state */
function refreshLabViewportLayout(state) {
    if (mapCanvasResize) mapCanvasResize.setSize(mapCanvasResize.getSize());
    if (animCanvasResize && state.labShowAnimationPreview) animCanvasResize.setSize(animCanvasResize.getSize());
    fitLabStageToView(state);
    renderTilelabPreview(state);
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
    registerEditorProfiles(state);
    const onLabViewChange = () => {
        renderTilelabPreview(state);
        if (state.worldSurfaces.hasPendingSurfaceBakes()) runBakeRepaintLoop(state);
    };
    labViewport = mountLabViewport(state, onLabViewChange);
    bindViewModeControls(state, onLabViewChange, () => refreshLabViewportLayout(state));
    buildTopologySettingsPanel(state);
    for (const id of ["showNodesInput", "showRoomZonesInput", "showWallsInput", "showGridBoundsInput", "showPathDebugInput"]) document.getElementById(id).addEventListener("change", onLabViewChange);
    initMapTopologyInteractions(state, () => renderTilelabPreview(state));
    mountTilelabSandbox(state, () => renderTilelabPreview(state));
    bindToolbarControls({
        onRefresh: () => schedulePreviewRefresh(state, 0),
        onRandomMap: () => {
            rollRandomTilelabMap(state);
            schedulePreviewRefresh(state, 0);
        },
        onStageResize: () => {
            state.viewport.setCanvasSize(state.labCanvas.width, state.labCanvas.height);
            fitLabStageToView(state);
            renderTilelabPreview(state);
        },
    });
    fitLabStageToView(state);
    const animCanvas = document.getElementById("animationPreviewCanvas");
    animCanvasResize = applySquareCanvasResize(animCanvas, {
        host: document.getElementById("animationPreviewHost"),
        initialSize: 200,
        minSize: 128,
        maxSize: () => {
            if (!state.labShowAnimationPreview) return 128;
            const container = document.querySelector(".map-container");
            const rect = container.getBoundingClientRect();
            const column = document.querySelector(".map-viewport-column");
            const zoom = document.getElementById("labZoomControl");
            const speed = document.getElementById("labSpeedControl");
            const gap = parseFloat(getComputedStyle(column).gap) || 10;
            const controlsH = (zoom?.offsetHeight ?? 0) + (speed?.offsetHeight ?? 0) + gap * 2;
            const minMapH = 160;
            const animHeader = 30;
            const available = rect.height - controlsH - minMapH - gap * 3 - animHeader;
            return Math.max(128, Math.floor(Math.min(rect.width, available) - 8));
        },
    });
    initAnimationPreview(animCanvas, buildProfileFromEditor);
    mapCanvasResize = applySquareCanvasResize(state.labCanvas, {
        host: document.getElementById("mapStage"),
        initialSize: 320,
        minSize: 160,
        maxSize: () => {
            const container = document.querySelector(".map-container");
            const rect = container.getBoundingClientRect();
            const column = document.querySelector(".map-viewport-column");
            const zoom = document.getElementById("labZoomControl");
            const speed = document.getElementById("labSpeedControl");
            const gap = parseFloat(getComputedStyle(column).gap) || 10;
            const controlsH = (zoom?.offsetHeight ?? 0) + (speed?.offsetHeight ?? 0) + gap * 2;
            const animH = state.labShowAnimationPreview ? estimateAnimationPreviewHeight() + gap : 0;
            return Math.max(160, Math.floor(Math.min(rect.width, rect.height - controlsH - animH) - 8));
        },
        onResize: (size) => {
            state.viewport.setCanvasSize(size, size);
            fitLabStageToView(state);
            renderTilelabPreview(state);
        },
    });
    initResizer("resizer", () => {
        state.viewport.setCanvasSize(state.labCanvas.width, state.labCanvas.height);
        fitLabStageToView(state);
        renderTilelabPreview(state);
    });
    registerEditorProfiles(state).then(() => {
        fitLabStageToView(state);
        syncMapInspectorAfterRegen(state, () => renderTilelabPreview(state));
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
        labViewport = null;
        bootstrapped = false;
    },
    updateUI({ state }) {
        if (!bootstrapped) return;
        labViewport.refresh(state);
        renderTilelabPreview(state);
        if (state.worldSurfaces.hasPendingSurfaceBakes()) runBakeRepaintLoop(state);
    },
};
