import { listShippedSurfaceProfileIds } from "../../../Config/procedural/profiles.js";
import { applySquareCanvasResize } from "../../../Libraries/Canvas/index.js";
import { initResizer } from "./lab-shared.js";
import { ensureLabPathDebugCache } from "../../../Libraries/Render/map/labMapCaches.js";
import { initAnimationPreview, mountAnimationPreviewCanvas, estimateAnimationPreviewHeight, syncAnimationPreviewCanvasSize } from "./LabAnimationPreview.js";
import { mountMapOverview, estimateMapOverviewHeight, paintMapOverviewFrame, syncMapOverviewCanvasSize } from "./mapOverview.js";
import { refreshMapGenPanelInputs } from "./mapGenEditors.js";
import { initProfileEditor, buildProfileFromEditor } from "./profile/ProfileEditor.js";
import { drawLabFrame, pushEditorProfile, repaintUntilBakesDone, applyLabWorldRenderMode } from "./preview.js";
import { initPresetSelect, bindToolbarControls, bindVectorPropsToolbar, syncWorldRenderModeUi, mountPlayAreaToolbarControls, commitPlayAreaFromToolbar } from "./toolbar.js";
import { initTileLabWorld } from "../world/mapWorld.js";
import { fitLabStageToView, mountLabViewport, refreshLabSpeed } from "./labViewport.js";
import { TILELAB_UI_HTML } from "./shellHtml.js";
import { mountTilelabSandbox } from "../world/tilelabSandbox.js";
import { bindViewModeControls } from "./viewMode.js";
import { EDITOR_CANVAS_DEFAULTS } from "../state.js";
let profileRefreshTimer = null;
/** @type {import("../../../Libraries/Canvas/squareCanvasResize.js").SquareCanvasResizeHandle | null} */
let mapCanvasResize = null;
let resizeCanvasesRaf = null;
/** @param {import("../state.js").TileLabGameState} state */
function mapColumnLayout(state) {
    const container = document.querySelector(".map-container");
    const column = document.querySelector(".map-viewport-column");
    const gap = parseFloat(getComputedStyle(column).gap) || 10;
    const controlsH = (document.getElementById("labZoomControl")?.offsetHeight ?? 0) + (document.getElementById("labSpeedControl")?.offsetHeight ?? 0) + gap * 2;
    const animH = state.editor.showAnimationPreview ? estimateAnimationPreviewHeight() + gap : 0;
    const overviewH = state.editor.showMapOverview ? estimateMapOverviewHeight() + gap : 0;
    return { container, gap, controlsH, animH, overviewH };
}
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
    if (resizeCanvasesRaf != null) return;
    resizeCanvasesRaf = requestAnimationFrame(() => {
        resizeCanvasesRaf = null;
        syncAnimationPreviewCanvasSize(state);
        if (mapCanvasResize) mapCanvasResize.setSize(mapCanvasResize.getSize());
        else onMapCanvasResize(state, state.editor.canvas.width);
        syncMapOverviewCanvasSize();
        paintMapOverviewFrame(state);
    });
}
/** @param {import("../state.js").TileLabGameState} state @param {{ playbackHandlers: import("../../../Libraries/Playback/speedControl.js").PlaybackHandlers }} options */
export function mountEditorUi(state, { playbackHandlers }) {
    const requestRedraw = () => {
        drawLabFrame(state);
        repaintUntilBakesDone(state);
        refreshMapGenPanelInputs();
    };
    const uiRoot = document.getElementById("ui-root");
    uiRoot.innerHTML = TILELAB_UI_HTML;
    const mapStage = document.getElementById("mapStage");
    const canvas = document.getElementById("gameCanvas");
    if (canvas.parentElement !== mapStage) mapStage.appendChild(canvas);
    state.editor.canvas = canvas;
    state.editor.ctx = canvas.getContext("2d");
    initPresetSelect(listShippedSurfaceProfileIds());
    initProfileEditor({
        onChange: (options = {}) => {
            if (options.reloadProfile) scheduleProfileRefresh(state, requestRedraw, 0);
            else if (options.lightweight) scheduleProfileRefresh(state, requestRedraw, 150);
            else scheduleProfileRefresh(state, requestRedraw, 300);
        },
    });
    pushEditorProfile(state);
    mountLabViewport(state, requestRedraw, playbackHandlers);
    bindViewModeControls(state, requestRedraw, () => resizeCanvases(state));
    mountMapOverview(state, () => {
        paintMapOverviewFrame(state);
        refreshMapGenPanelInputs();
    });
    mountPlayAreaToolbarControls(state);
    void initTileLabWorld(state).then(() => {
        resizeCanvases(state);
        drawLabFrame(state);
    });
    mountTilelabSandbox(state, requestRedraw);
    bindToolbarControls({
        onOverlayChange: () => {
            if (document.getElementById("showPathDebugInput").checked) void ensureLabPathDebugCache(state).then(() => drawLabFrame(state));
            else drawLabFrame(state);
        },
        onRedraw: () => {
            commitPlayAreaFromToolbar(state);
            pushEditorProfile(state);
            requestRedraw();
            paintMapOverviewFrame(state);
        },
        onStageResize: () => resizeCanvases(state),
        onRenderModeChange: (mode) => {
            state.worldRenderMode = mode;
            applyLabWorldRenderMode(state);
            requestRedraw();
        },
    });
    bindVectorPropsToolbar(state, requestRedraw);
    syncWorldRenderModeUi(state);
    const overviewViewportInput = document.getElementById("showMapOverviewViewportInput");
    overviewViewportInput.checked = state.editor.showMapOverviewViewport;
    overviewViewportInput.addEventListener("change", (e) => {
        state.editor.showMapOverviewViewport = /** @type {HTMLInputElement} */ (e.target).checked;
    });
    const selectionRingsInput = document.getElementById("showSelectionRingsInput");
    selectionRingsInput.checked = state.sandbox.controller.getShowSelectionRings();
    selectionRingsInput.addEventListener("change", (e) => {
        state.sandbox.controller.setShowSelectionRings(/** @type {HTMLInputElement} */ (e.target).checked);
        requestRedraw();
    });
    const propTileCellsInput = document.getElementById("showPropTileCellsInput");
    propTileCellsInput.checked = state.sandbox.controller.getShowPropTileCells();
    propTileCellsInput.addEventListener("change", (e) => {
        state.sandbox.controller.setShowPropTileCells(/** @type {HTMLInputElement} */ (e.target).checked);
        requestRedraw();
    });
    const roomNodesAlwaysInput = document.getElementById("showRoomNodesAlwaysInput");
    roomNodesAlwaysInput.checked = state.sandbox.controller.getShowRoomNodesAlways();
    roomNodesAlwaysInput.addEventListener("change", (e) => {
        state.sandbox.controller.setShowRoomNodesAlways(/** @type {HTMLInputElement} */ (e.target).checked);
        requestRedraw();
    });
    fitLabStageToView(state);
    const animCanvas = document.getElementById("animationPreviewCanvas");
    const { animationPreview, main } = EDITOR_CANVAS_DEFAULTS;
    mountAnimationPreviewCanvas(animCanvas, {
        host: document.getElementById("animationPreviewHost"),
        maxSize: () => {
            if (!state.editor.showAnimationPreview) return animationPreview.minSize;
            const { container, gap, controlsH, overviewH } = mapColumnLayout(state);
            const rect = container.getBoundingClientRect();
            const available = rect.height - controlsH - overviewH - gap * 3 - 30;
            return Math.max(animationPreview.minSize, Math.floor(Math.min(rect.width, available) - 8));
        },
    });
    initAnimationPreview(animCanvas, buildProfileFromEditor);
    mapCanvasResize = applySquareCanvasResize(state.editor.canvas, {
        host: document.getElementById("mapStage"),
        initialSize: main.initialSize,
        minSize: main.minSize,
        maxSize: () => {
            const { container, gap, controlsH, animH, overviewH } = mapColumnLayout(state);
            const rect = container.getBoundingClientRect();
            return Math.max(main.minSize, Math.floor(Math.min(rect.width, rect.height - controlsH - animH - overviewH) - 8));
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
