import { shippedSurfaceProfileIds } from "../../../Config/procedural/profiles.js";
import { applySquareCanvasResize } from "./squareCanvasResize.js";
import { initResizer } from "./lab-shared.js";
import { getNavPathDebugCache } from "../../../Libraries/Navigation/navDebug.js";
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
    const isSpeedInToolbar = document.querySelector(".toolbar #labSpeedControl") !== null;
    const speedCtrlH = isSpeedInToolbar ? 0 : (document.getElementById("labSpeedControl")?.offsetHeight ?? 0);
    const controlsH = (document.getElementById("labZoomControl")?.offsetHeight ?? 0) + speedCtrlH + gap * 2;
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
    if (state.appLaunch?.id === "snake") {
        const titleEl = document.querySelector(".toolbar h1");
        if (titleEl) titleEl.style.display = "none";
        const seps = document.querySelectorAll(".toolbar .sep");
        seps.forEach(sep => sep.style.display = "none");
        
        state.editor.showMapOverview = false;
        state.editor.showSelectionRings = false;
        
        const mapOverviewInput = document.getElementById("showMapOverviewInput");
        if (mapOverviewInput) {
            mapOverviewInput.checked = false;
            const lbl = mapOverviewInput.closest("label");
            if (lbl) lbl.style.display = "none";
        }
        
        const selectionRingsInput = document.getElementById("showSelectionRingsInput");
        if (selectionRingsInput) {
            selectionRingsInput.checked = false;
            const lbl = selectionRingsInput.closest("label");
            if (lbl) lbl.style.display = "none";
        }
        
        const regenerateBtn = document.getElementById("regenerateBtn");
        if (regenerateBtn) {
            regenerateBtn.style.display = "none";
        }

        const speedCtrl = document.getElementById("labSpeedControl");
        const shadowSlider = document.getElementById("editorShadowSlider");
        if (speedCtrl && shadowSlider) {
            const shadowLabel = shadowSlider.closest("label");
            if (shadowLabel) {
                shadowLabel.insertAdjacentElement("afterend", speedCtrl);
                speedCtrl.style.display = "inline-flex";
                speedCtrl.style.alignItems = "center";
                speedCtrl.style.marginLeft = "15px";
                
                const speedLabelSpan = document.createElement("span");
                speedLabelSpan.textContent = "Speed";
                speedLabelSpan.style.marginRight = "8px";
                speedLabelSpan.style.fontSize = "12px";
                speedLabelSpan.style.color = "var(--text)";
                speedCtrl.insertBefore(speedLabelSpan, speedCtrl.firstChild);
            }
        }

        const pathDebugBtn = document.getElementById("pathDebugModeBtn");
        if (pathDebugBtn) {
            const toggleBtn = document.createElement("button");
            toggleBtn.type = "button";
            toggleBtn.id = "navModeToggleBtn";
            toggleBtn.className = "toolbar-cycle-btn";
            toggleBtn.style.marginLeft = "10px";
            toggleBtn.textContent = state.editor.navMode === "flow" ? "Mode: Flow" : "Mode: A*";
            pathDebugBtn.insertAdjacentElement("afterend", toggleBtn);
            toggleBtn.addEventListener("click", () => {
                const nextMode = state.editor.navMode === "flow" ? "hpa" : "flow";
                setEditorNavMode(state, nextMode);
                toggleBtn.textContent = nextMode === "flow" ? "Mode: Flow" : "Mode: A*";
            });
        }
    }
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
                if (isLabPathDebugActive()) void getNavPathDebugCache(state).ensureTopology(state, getLabPathDebugMode());
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
        mapCanvasResize = applySquareCanvasResize(state.editor.canvas, { host: document.getElementById("mapStage"), initialSize: main.initialSize, minSize: main.minSize, maxSize: () => computeMapColumnSlotMax(state), onResize: (size) => onMapCanvasResize(state, size) });
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
export function setEditorNavMode(state, mode) {
    state.editor.navMode = mode;
    const boid = state.worldProps.find((p) => p.type === "boid_triangle");
    if (!boid) return;
    const entityMeta = state.sandbox.entityMeta;
    const currentBehaviorId = entityMeta.getActiveBehaviorId(boid.id);
    if (currentBehaviorId === "rollToCursorHpa" || currentBehaviorId === "rollToCursorFlow") {
        const nextBehaviorId = mode === "flow" ? "rollToCursorFlow" : "rollToCursorHpa";
        if (currentBehaviorId !== nextBehaviorId) {
            const behaviorById = state.sandbox.behaviorById;
            const oldBehavior = behaviorById?.get(currentBehaviorId);
            const nextBehavior = behaviorById?.get(nextBehaviorId);
            if (oldBehavior && nextBehavior) {
                const overlay = oldBehavior.getPathOverlay(boid);
                const targetWorld = overlay?.targetX != null ? { x: overlay.targetX, y: overlay.targetY } : null;
                if (oldBehavior.clearMoveTarget) oldBehavior.clearMoveTarget(boid);
                entityMeta.setActiveBehaviorId(boid.id, nextBehaviorId);
                if (targetWorld) {
                    nextBehavior.setMoveTarget(boid, targetWorld);
                }
            }
        }
    }
}
