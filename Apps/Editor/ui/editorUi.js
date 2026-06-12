import { listShippedSurfaceProfileIds } from "../../../Config/procedural/profiles.js";
import { applySquareCanvasResize } from "../../../Libraries/Canvas/index.js";
import { initResizer } from "./lab-shared.js";
import { initAnimationPreview, estimateAnimationPreviewHeight } from "./LabAnimationPreview.js";
import { mountMapOverview, estimateMapOverviewHeight, paintMapOverviewFrame } from "./mapOverview.js";
import { refreshMapPanelInputs } from "./mapPanel.js";
import { initProfileEditor, buildProfileFromEditor } from "./profile/ProfileEditor.js";
import { drawLabFrame, pushEditorProfile, repaintUntilBakesDone, applyLabWorldRenderMode } from "./preview.js";
import { initPresetSelect, bindToolbarControls, syncWorldRenderModeUi } from "./toolbar.js";
import { fitLabStageToView, mountLabViewport, refreshLabSpeed } from "./labViewport.js";
import { TILELAB_UI_HTML } from "./shellHtml.js";
import { buildMapPanel } from "./mapPanel.js";
import { mountTilelabSandbox } from "../world/tilelabSandbox.js";
import { bindViewModeControls } from "./viewMode.js";
let profileRefreshTimer = null;
/** @type {import("../../../Libraries/Canvas/squareCanvasResize.js").SquareCanvasResizeHandle | null} */
let animCanvasResize = null;
/** @type {import("../../../Libraries/Canvas/squareCanvasResize.js").SquareCanvasResizeHandle | null} */
let mapCanvasResize = null;
function scheduleProfileRefresh(state, requestRedraw, debounceMs) {
    if (profileRefreshTimer != null) clearTimeout(profileRefreshTimer);
    const run = () => {
        pushEditorProfile(state);
        requestRedraw();
    };
    if (debounceMs <= 0) run();
    else profileRefreshTimer = setTimeout(run, debounceMs);
}
function onMapCanvasResize(state, size) {
    state.viewport.setCanvasSize(size, size);
    fitLabStageToView(state);
    drawLabFrame(state);
}
function resizeCanvases(state) {
    if (animCanvasResize && state.labShowAnimationPreview) animCanvasResize.setSize(animCanvasResize.getSize());
    if (mapCanvasResize) mapCanvasResize.setSize(mapCanvasResize.getSize());
    else onMapCanvasResize(state, state.labCanvas.width);
    paintMapOverviewFrame(state);
}
/** @param {import("../state.js").TileLabGameState} state */
export function mountEditorUi(state) {
    const requestRedraw = () => {
        drawLabFrame(state);
        repaintUntilBakesDone(state);
        refreshMapPanelInputs();
    };
    const uiRoot = document.getElementById("ui-root");
    uiRoot.innerHTML = TILELAB_UI_HTML;
    const mapStage = document.getElementById("mapStage");
    const canvas = document.getElementById("gameCanvas");
    if (canvas.parentElement !== mapStage) mapStage.appendChild(canvas);
    state.labCanvas = canvas;
    state.labCtx = canvas.getContext("2d");
    initPresetSelect(listShippedSurfaceProfileIds());
    initProfileEditor({
        onChange: (options = {}) => {
            if (options.reloadProfile) scheduleProfileRefresh(state, requestRedraw, 0);
            else if (options.lightweight) scheduleProfileRefresh(state, requestRedraw, 150);
            else scheduleProfileRefresh(state, requestRedraw, 300);
        },
    });
    pushEditorProfile(state);
    mountLabViewport(state, requestRedraw);
    bindViewModeControls(state, requestRedraw, () => resizeCanvases(state));
    mountMapOverview(state, () => {
        paintMapOverviewFrame(state);
        refreshMapPanelInputs();
    });
    buildMapPanel(state, requestRedraw);
    mountTilelabSandbox(state, requestRedraw);
    bindToolbarControls({
        onOverlayChange: () => drawLabFrame(state),
        onRedraw: () => {
            pushEditorProfile(state);
            requestRedraw();
        },
        onStageResize: () => resizeCanvases(state),
        onRenderModeChange: (mode) => {
            state.worldRenderMode = mode;
            applyLabWorldRenderMode(state);
            requestRedraw();
        },
    });
    syncWorldRenderModeUi(state);
    const overviewViewportInput = document.getElementById("showMapOverviewViewportInput");
    overviewViewportInput.checked = state.labShowMapOverviewViewport;
    overviewViewportInput.addEventListener("change", (e) => {
        state.labShowMapOverviewViewport = /** @type {HTMLInputElement} */ (e.target).checked;
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
            const gap = parseFloat(getComputedStyle(column).gap) || 10;
            const controlsH = (document.getElementById("labZoomControl")?.offsetHeight ?? 0) + (document.getElementById("labSpeedControl")?.offsetHeight ?? 0) + gap * 2;
            const available = rect.height - controlsH - 160 - gap * 3 - 30;
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
            const gap = parseFloat(getComputedStyle(column).gap) || 10;
            const controlsH = (document.getElementById("labZoomControl")?.offsetHeight ?? 0) + (document.getElementById("labSpeedControl")?.offsetHeight ?? 0) + gap * 2;
            const animH = state.labShowAnimationPreview ? estimateAnimationPreviewHeight() + gap : 0;
            const overviewH = state.labShowMapOverview ? estimateMapOverviewHeight() + gap : 0;
            return Math.max(160, Math.floor(Math.min(rect.width, rect.height - controlsH - animH - overviewH) - 8));
        },
        onResize: (size) => onMapCanvasResize(state, size),
    });
    initResizer("resizer", () => resizeCanvases(state));
    resizeCanvases(state);
    drawLabFrame(state);
}
/** @param {import("../state.js").TileLabGameState} state */
export function refreshEditorUi(state) {
    refreshLabSpeed(state);
    drawLabFrame(state);
    repaintUntilBakesDone(state);
}
