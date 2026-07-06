import { shippedSurfaceProfileIds } from "../../../Config/procedural/profiles.js";
import { applySquareCanvasResize } from "./squareCanvasResize.js";
import { initResizer } from "./lab-shared.js";
import { ensureLabPathDebugCache, buildPathDebugCacheOpts } from "../../../Libraries/Render/render.js";
import { mountMapOverview, paintMapOverviewFrame, requestMapOverviewRepaint, flushMapOverviewRepaint, syncMapOverviewCanvasSize } from "./mapOverview.js";
import { refreshMapGenPanelInputs } from "./mapGenEditors.js";
import { initProfileEditor, buildProfileFromEditor } from "./profile/ProfileEditor.js";
import { drawLabFrame, pushEditorProfile, repaintUntilBakesDone, applyLabWorldRenderMode, mountLabFrameRefresh, mountLabDrawOptions, isLabPathDebugActive, getLabPathDebugMode } from "./preview.js";
import { initPresetSelect, bindToolbarControls, syncWorldRenderModeUi } from "./toolbar.js";
import { initTileLabWorld } from "../../../Libraries/Spatial/spatial.js";
import { fitLabStageToView, mountLabViewport, refreshLabSpeed } from "./labViewport.js";
import { TILELAB_UI_HTML } from "./shellHtml.js";
import { mountTilelabSandbox } from "../world/tilelabSandbox.js";
import { bindViewModeControls } from "./viewMode.js";
import { EDITOR_CANVAS_DEFAULTS } from "../state.js";
import { runGameLaunch } from "../../../Libraries/Game/gameLaunch.js";
let profileRefreshTimer = null;
/** @type {import("../../../Libraries/Canvas/squareCanvasResize.js").SquareCanvasResizeHandle | null} */
let mapCanvasResize = null;
let layoutResizePending = false;
/** @type {{ mark: () => void, repaintMapOverview: () => void } | null} */
let labCanvasResizeHooks = null;
export function fitEditorCanvasToStage(state) {
    const stage = document.getElementById("mapStage");
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const canvas = state.editor.canvas;
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
        state.viewport.setCanvasSize(rect.width, rect.height);
    }
}
/** @param {import("../state.js").TileLabGameState} state */
function computeMapColumnSlotMax(state) {
    const container = document.querySelector(".map-container");
    const column = document.querySelector(".map-viewport-column");
    const gap = parseFloat(getComputedStyle(column).gap) || 10;
    const controlsH = (document.getElementById("labZoomControl")?.offsetHeight ?? 0) + (document.getElementById("labSpeedControl")?.offsetHeight ?? 0) + gap * 2;
    const squareSlots = 1 + (state.editor.showMapOverview ? 1 : 0);
    const rect = container.getBoundingClientRect();
    const availableH = rect.height - controlsH - gap * squareSlots;
    return Math.max(EDITOR_CANVAS_DEFAULTS.main.minSize, Math.floor(Math.min(rect.width - 8, availableH / squareSlots)));
}
function fitMapColumnCanvases(state) {
    const stackSize = computeMapColumnSlotMax(state);
    if (state.editor.lastFittedSizes && state.editor.lastFittedSizes.includes(stackSize)) return;
    state.editor.lastFittedSizes = state.editor.lastFittedSizes || [];
    state.editor.lastFittedSizes.push(stackSize);
    if (state.editor.lastFittedSizes.length > 2) state.editor.lastFittedSizes.shift();
    syncMapOverviewCanvasSize(stackSize);
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
function onMapCanvasResize(state, size) {
    state.viewport.setCanvasSize(size, size);
    fitLabStageToView(state);
    labCanvasResizeHooks?.mark();
    labCanvasResizeHooks?.repaintMapOverview();
}
function resizeCanvases(state) {
    layoutResizePending = true;
}
/** @param {import("../state.js").TileLabGameState} state */
export function flushEditorLayoutResize(state) {
    if (!layoutResizePending) return;
    layoutResizePending = false;
    if (document.body.classList.contains("hide-sidebar")) {
        fitEditorCanvasToStage(state);
        return;
    }
    fitMapColumnCanvases(state);
    if (!mapCanvasResize) onMapCanvasResize(state, state.editor.canvas.width);
    requestMapOverviewRepaint();
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
    const scheduleMapOverviewRepaint = () => requestMapOverviewRepaint();
    const uiRoot = document.getElementById("ui-root");
    uiRoot.innerHTML = TILELAB_UI_HTML;
    const mapStage = document.getElementById("mapStage");
    const canvas = document.getElementById("gameCanvas");
    if (canvas.parentElement !== mapStage) mapStage.appendChild(canvas);
    state.editor.canvas = canvas;
    state.editor.ctx = canvas.getContext("2d");
    state.editor.ctx.imageSmoothingEnabled = false;
    const markLabViewDirty = mountLabFrameRefresh(canvas);
    labCanvasResizeHooks = { mark: markLabViewDirty, repaintMapOverview: scheduleMapOverviewRepaint };
    mountLabDrawOptions(state);
    initPresetSelect(shippedSurfaceProfileIds());
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
            markLabViewDirty();
            scheduleMapOverviewRepaint();
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
            scheduleMapOverviewRepaint();
            refreshMapGenPanelInputs();
        },
        () => computeMapColumnSlotMax(state),
    );
    void initTileLabWorld(state).then(async () => {
        resizeCanvases(state);
        if (state.appLaunch?.launcher && !state.appLaunch.launcher.hideEditor) await runGameLaunch(state, state.appLaunch.launcher, { playbackHandlers });
        drawLabAndWaitForBakes();
    });
    mountTilelabSandbox(state);
    bindToolbarControls(
        {
            onOverlayChange: () => {
                if (isLabPathDebugActive()) void ensureLabPathDebugCache(state, buildPathDebugCacheOpts(state, getLabPathDebugMode()));
            },
            onRedraw: () => {
                pushEditorProfile(state);
                fitLabStageToView(state);
                drawLabAndWaitForBakes();
            },
            onStageResize: () => resizeCanvases(state),
            onRenderModeChange: () => applyLabWorldRenderMode(state),
        },
        state,
    );
    syncWorldRenderModeUi(state);
    fitLabStageToView(state);
    if (document.body.classList.contains("hide-sidebar")) fitEditorCanvasToStage(state);
    else {
        const { main } = EDITOR_CANVAS_DEFAULTS;
        mapCanvasResize = applySquareCanvasResize(state.editor.canvas, {
            host: document.getElementById("mapStage"),
            initialSize: main.initialSize,
            minSize: main.minSize,
            maxSize: () => computeMapColumnSlotMax(state),
            onResize: (size) => onMapCanvasResize(state, size),
        });
        initResizer("resizer", () => resizeCanvases(state));
    }
    resizeCanvases(state);
    flushEditorLayoutResize(state);
    flushMapOverviewRepaint(state);
    drawLab();
}
/** @param {import("../state.js").TileLabGameState} state */
export function refreshEditorUi(state) {
    refreshLabSpeed(state);
    repaintUntilBakesDone(state);
}
