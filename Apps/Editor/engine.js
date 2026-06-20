import { installGameState } from "../../GameState/GameState.js";
import { events, requestUiUpdate, Events } from "../../Core/EventSystem.js";
import { PauseManager } from "../../Libraries/Pause/index.js";
import { installEditorDefaults } from "../../Core/engineGlobals.js";
import { adjustSelectedSpeed } from "../../Libraries/Playback/playbackController.js";
import { kineticSpatial } from "../../Systems/World/KineticSpatialFrame.js";
import { kineticTickFromState } from "../../GameState/KineticTick.js";
import { runKineticPhysics } from "../../Libraries/Motion/kineticPhysicsPass.js";
import { applyKineticContactSideEffects } from "../../Libraries/Spatial/collision/kineticContactSideEffects.js";
import { flushPendingWallDamage, resolveKineticWallDamage } from "../../Libraries/Sandbox/gridWallDamage.js";
import { FLOATING_TEXT_SPAWN_EVENT, FloatingText } from "../../Libraries/Render/FloatingText.js";
import { TileLabGameState } from "./state.js";
import { tickFloorProps } from "../../Libraries/Sandbox/floorProps.js";
import { tickFloorOccupancy } from "../../Libraries/Sandbox/floorOccupancy.js";
import { tickGridZones } from "../../Libraries/Sandbox/gridZoneTick.js";
import { installRadioOverlay } from "../../Libraries/Radio/installRadioOverlay.js";
import { tickSandboxCameraFollow } from "../../Libraries/Sandbox/sandboxCameraTarget.js";
import { fitLabStageToView, tickLabViewportNavigation } from "./ui/labViewport.js";
import { tickGameViewportNavigation } from "./ui/gameViewport.js";
import { mountEditorUi, refreshEditorUi, resizeEditorLayout, flushEditorLayoutResize } from "./ui/editorUi.js";
import { mountGameShell, resizeGameShell } from "./ui/mountGameShell.js";
import { getGameLauncher } from "../../Libraries/Game/gameLaunchers.js";
import { drawLabFrame, shouldRenderLabFrame } from "./ui/preview.js";
import { flushMapOverviewRepaint } from "./ui/mapOverview.js";
import { tickAnimationPreview } from "./ui/LabAnimationPreview.js";
/** @param {import("./state.js").TileLabGameState} state */
function loadGameModeStylesheet() {
    if (document.getElementById("game-mode-css")) return;
    const link = document.createElement("link");
    link.id = "game-mode-css";
    link.rel = "stylesheet";
    link.href = new URL("./game-mode.css", import.meta.url).href;
    document.head.appendChild(link);
}
/** @param {import("./state.js").TileLabGameState} state */
function simulationKineticHooks(state) {
    const applyContactSideEffects = state.appLaunch?.session?.applyContactSideEffects ?? ((tick, contacts) => applyKineticContactSideEffects(tick, contacts));
    return {
        updateProp(prop, dt, frame) {
            prop.update(dt, state, frame);
        },
        resolveWalls(entity, frame) {
            const session = state.appLaunch?.session;
            if (session?.resolveWalls) return session.resolveWalls(entity, frame);
            return resolveKineticWallDamage(state, entity, frame, state.wallResolver);
        },
        applyContactSideEffects,
        afterKineticPhysics() {
            state.appLaunch?.session?.afterKineticPhysics?.();
            flushPendingWallDamage(state);
        },
    };
}
/** @param {import("./state.js").TileLabGameState} state @param {number} dt */
function runSimulationTick(state, dt) {
    const simDt = dt * state.selectedSpeed;
    state.gameTime += simDt;
    if (!state.sandbox.snakeGame) state.hpaPathSession.beginFrame();
    const spatialFrame = kineticSpatial.begin(state);
    tickFloorProps(state, spatialFrame, simDt);
    tickFloorOccupancy(state, spatialFrame, simDt);
    runKineticPhysics(kineticTickFromState(state, spatialFrame), simDt, simulationKineticHooks(state));
    tickGridZones(state, spatialFrame);
    FloatingText.updateAll(state, simDt);
    if (!state.sandbox.snakeGame) state.hpaPathSession.flushFrame();
}
export function createEditorApp(options = {}) {
    const gameLaunchId = options.gameLaunchId ?? null;
    const launcher = gameLaunchId ? getGameLauncher(gameLaunchId) : null;
    const gameMode = launcher != null;
    const state = new TileLabGameState();
    state.appLaunch = gameLaunchId ? { id: gameLaunchId, launcher } : null;
    state.entityLayers = [];
    state.floatingTexts = [];
    state.entityLayers.push({ key: "floatingTexts", zIndex: 100 });
    installGameState(state);
    document.title = gameMode ? launcher.title : "Editor";
    document.body.classList.add("shell-tilelab");
    if (gameMode) {
        document.body.classList.add("shell-game");
        loadGameModeStylesheet();
    }
    if (!document.getElementById("tilelab-css")) {
        const link = document.createElement("link");
        link.id = "tilelab-css";
        link.rel = "stylesheet";
        link.href = new URL("./tilelab.css", import.meta.url).href;
        document.head.appendChild(link);
    }
    installEditorDefaults(state);
    const pauseManager = new PauseManager(state);
    installRadioOverlay(document.getElementById("gameWrapper"), {
        eventBus: events,
        requestPause: (reason) => pauseManager.pause(reason),
        requestResume: (reason) => pauseManager.resume(reason),
        content: { conversations: {}, speakers: {}, mainCharacterId: "player" },
    });
    const playbackHandlers = {
        togglePause() {
            pauseManager.toggleUser();
            requestUiUpdate();
        },
        adjustSpeed(delta) {
            adjustSelectedSpeed(state, delta);
            requestUiUpdate();
        },
    };
    function loop(timestamp) {
        if (state.lastTime === 0) state.lastTime = timestamp;
        let dt = timestamp - state.lastTime;
        state.lastTime = timestamp;
        dt = Math.min(dt, 50);
        if (gameMode) resizeGameShell(state);
        else flushEditorLayoutResize(state);
        state.scheduler.update(dt);
        if (gameMode) tickGameViewportNavigation(dt);
        else tickLabViewportNavigation(dt);
        tickSandboxCameraFollow(state.viewport, state, state.entityRegistry, dt);
        state.appLaunch?.session?.tick(dt);
        state.sandbox.controller?.tick(dt);
        if (!state.isPaused) runSimulationTick(state, dt);
        if (shouldRenderLabFrame(state)) drawLabFrame(state);
        if (!gameMode) {
            tickAnimationPreview(timestamp);
            flushMapOverviewRepaint(state);
        }
        requestAnimationFrame(loop);
    }
    events.on(FLOATING_TEXT_SPAWN_EVENT, FloatingText.handleSpawnEvent);
    if (!gameMode) events.on(Events.UI_UPDATE, () => refreshEditorUi(state));
    window.addEventListener("resize", () => {
        if (gameMode) resizeGameShell(state);
        else resizeEditorLayout(state);
        state.viewport.setCanvasSize(state.editor.canvas.width, state.editor.canvas.height);
    });
    if (gameMode) void mountGameShell(state, launcher);
    else mountEditorUi(state, { playbackHandlers });
    if (!gameMode) {
        state.viewport.setCanvasSize(state.editor.canvas.width, state.editor.canvas.height);
        fitLabStageToView(state);
    }
    requestAnimationFrame(loop);
}
