import { listShippedSurfaceProfileIds } from "../../../Config/procedural/profiles.js";
import { applySquareCanvasResize } from "../../../Libraries/Canvas/index.js";
import { initResizer } from "./lab-shared.js";
import { ensureLabPathDebugCache } from "../../../Libraries/Render/map/labMapCaches.js";
import { initAnimationPreview, mountAnimationPreviewCanvas, setAnimationPreviewActive, syncAnimationPreviewCanvasSize } from "./LabAnimationPreview.js";
import { mountMapOverview, paintMapOverviewFrame, syncMapOverviewCanvasSize } from "./mapOverview.js";
import { refreshMapGenPanelInputs } from "./mapGenEditors.js";
import { initProfileEditor, buildProfileFromEditor } from "./profile/ProfileEditor.js";
import { drawLabFrame, pushEditorProfile, repaintUntilBakesDone, applyLabWorldRenderMode, requestLabFrame } from "./preview.js";
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
function computeMapColumnSlotMax(state) {
    const container = document.querySelector(".map-container");
    const column = document.querySelector(".map-viewport-column");
    const gap = parseFloat(getComputedStyle(column).gap) || 10;
    const controlsH = (document.getElementById("labZoomControl")?.offsetHeight ?? 0) + (document.getElementById("labSpeedControl")?.offsetHeight ?? 0) + gap * 2;
    const squareSlots = 1 + (state.editor.showMapOverview ? 1 : 0) + (state.editor.showAnimationPreview ? 1 : 0);
    const rect = container.getBoundingClientRect();
    const availableH = rect.height - controlsH - gap * squareSlots;
    return Math.max(EDITOR_CANVAS_DEFAULTS.main.minSize, Math.floor(Math.min(rect.width - 8, availableH / squareSlots)));
}
function fitMapColumnCanvases(state) {
    const stackSize = computeMapColumnSlotMax(state);
    syncMapOverviewCanvasSize(stackSize);
    syncAnimationPreviewCanvasSize(state, stackSize);
    if (mapCanvasResize) mapCanvasResize.setSize(stackSize);
}
function scheduleProfileRefresh(state, drawAfterProfilePush, debounceMs) {
    if (profileRefreshTimer != null) clearTimeout(profileRefreshTimer);
    const run = () => {
        pushEditorProfile(state);
        drawAfterProfilePush();
    };
    if (debounceMs <= 0) run();
    else profileRefreshTimer = setTimeout(run, debounceMs);
}
function onMapCanvasResize(state, size, repaintMapOverviewIfVisible) {
    state.viewport.setCanvasSize(size, size);
    fitLabStageToView(state);
    requestLabFrame();
    repaintMapOverviewIfVisible();
}
function resizeCanvases(state) {
    if (resizeCanvasesRaf != null) return;
    resizeCanvasesRaf = requestAnimationFrame(() => {
        resizeCanvasesRaf = null;
        fitMapColumnCanvases(state);
        if (!mapCanvasResize) onMapCanvasResize(state, state.editor.canvas.width);
        paintMapOverviewFrame(state);
    });
}
export function resizeEditorLayout(state) {
    resizeCanvases(state);
}
/** @param {import("../state.js").TileLabGameState} state @param {{ playbackHandlers: import("../../../Libraries/Playback/speedControl.js").PlaybackHandlers }} options */
export function mountEditorUi(state, { playbackHandlers }) {
    const drawLab = () => drawLabFrame(state);
    const drawLabAndWaitForBakes = () => {
        drawLabFrame(state);
        repaintUntilBakesDone(state);
    };
    state.editor.repaintMapOverview = () => paintMapOverviewFrame(state);
    const repaintMapOverviewIfVisible = () => {
        if (state.editor.showMapOverview) paintMapOverviewFrame(state);
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
            if (options.reloadProfile) scheduleProfileRefresh(state, drawLabAndWaitForBakes, 0);
            else if (options.lightweight) scheduleProfileRefresh(state, drawLabAndWaitForBakes, 150);
            else scheduleProfileRefresh(state, drawLabAndWaitForBakes, 300);
        },
    });
    pushEditorProfile(state);
    mountLabViewport(
        state,
        () => {
            requestLabFrame();
            repaintMapOverviewIfVisible();
        },
        playbackHandlers,
    );
    bindViewModeControls(
        state,
        () => {},
        () => resizeCanvases(state),
    );
    mountMapOverview(
        state,
        () => {
            paintMapOverviewFrame(state);
            refreshMapGenPanelInputs();
        },
        () => computeMapColumnSlotMax(state),
    );
    mountPlayAreaToolbarControls(state);
    void initTileLabWorld(state).then(() => {
        resizeCanvases(state);
        drawLabAndWaitForBakes();
    });
    mountTilelabSandbox(state);
    bindToolbarControls({
        onOverlayChange: () => {
            if (document.getElementById("showPathDebugInput").checked) void ensureLabPathDebugCache(state);
            requestLabFrame();
        },
        onRedraw: () => {
            commitPlayAreaFromToolbar(state);
            pushEditorProfile(state);
            drawLabAndWaitForBakes();
        },
        onStageResize: () => resizeCanvases(state),
        onRenderModeChange: (mode) => {
            state.worldRenderMode = mode;
            applyLabWorldRenderMode(state);
        },
    });
    bindVectorPropsToolbar(state, () => {});
    syncWorldRenderModeUi(state);
    const selectionRingsInput = document.getElementById("showSelectionRingsInput");
    selectionRingsInput.checked = state.sandbox.controller.getShowSelectionRings();
    selectionRingsInput.addEventListener("change", (e) => {
        state.sandbox.controller.setShowSelectionRings(/** @type {HTMLInputElement} */ (e.target).checked);
    });
    const propTileCellsInput = document.getElementById("showPropTileCellsInput");
    propTileCellsInput.checked = state.sandbox.controller.getShowPropTileCells();
    propTileCellsInput.addEventListener("change", (e) => {
        state.sandbox.controller.setShowPropTileCells(/** @type {HTMLInputElement} */ (e.target).checked);
    });
    const roomNodesAlwaysInput = document.getElementById("showRoomNodesAlwaysInput");
    roomNodesAlwaysInput.checked = state.sandbox.controller.getShowRoomNodesAlways();
    roomNodesAlwaysInput.addEventListener("change", (e) => {
        state.sandbox.controller.setShowRoomNodesAlways(/** @type {HTMLInputElement} */ (e.target).checked);
    });
    fitLabStageToView(state);
    const animCanvas = document.getElementById("animationPreviewCanvas");
    const { main } = EDITOR_CANVAS_DEFAULTS;
    mountAnimationPreviewCanvas(animCanvas, { host: document.getElementById("animationPreviewHost"), maxSize: () => computeMapColumnSlotMax(state) });
    initAnimationPreview(animCanvas, buildProfileFromEditor);
    setAnimationPreviewActive(state.editor.showAnimationPreview);
    mapCanvasResize = applySquareCanvasResize(state.editor.canvas, {
        host: document.getElementById("mapStage"),
        initialSize: main.initialSize,
        minSize: main.minSize,
        maxSize: () => computeMapColumnSlotMax(state),
        onResize: (size) => onMapCanvasResize(state, size, repaintMapOverviewIfVisible),
    });
    initResizer("resizer", () => resizeCanvases(state));
    resizeCanvases(state);
    drawLab();
}
/** @param {import("../state.js").TileLabGameState} state */
export function refreshEditorUi(state) {
    refreshLabSpeed(state);
    drawLabFrame(state);
    repaintUntilBakesDone(state);
}
