import { installGameState } from "../../GameState/GameState.js";
import { events, requestUiUpdate, Events } from "../../Core/EventSystem.js";
import { PauseManager } from "../../Libraries/Pause/index.js";
import { installEditorDefaults } from "../../Core/engineGlobals.js";
import { adjustSelectedSpeed } from "../../Libraries/Playback/playbackController.js";
import { kineticSpatial } from "../../Libraries/Spatial/spatial.js";
import { runKineticPhysics } from "../../Libraries/Physics/physics.js";
import { applyKineticAcceleration } from "../../Libraries/Physics/physics.js";
import { FractureEngine } from "../../Libraries/Physics/fracture.js";
import { clearChainLinksForProp } from "../../Libraries/Sandbox/sandbox.js";
import { createGridWallDamage, flushPendingWallDamage, resolveKineticWallDamage } from "../../Libraries/Physics/fracture.js";
import { commitGridNavEdit } from "../../Libraries/Spatial/spatial.js";
import { FLOATING_TEXT_SPAWN_EVENT, FloatingText } from "../../Libraries/Render/render.js";
import { TileLabGameState } from "./state.js";
import { registerMapGenBoundsGridExpansionListener } from "../../Libraries/Spatial/spatial.js";
import { FloorBelt } from "../../Libraries/Spatial/spatial.js";
import { installRadioOverlay } from "../../Libraries/Radio/installRadioOverlay.js";
import { tickSandboxCameraFollow } from "../../Libraries/Sandbox/sandbox.js";
import { fitLabStageToView, tickLabViewportNavigation } from "./ui/labViewport.js";
import { tickGameViewportNavigation } from "./ui/gameViewport.js";
import { mountEditorUi, refreshEditorUi, resizeEditorLayout, flushEditorLayoutResize } from "./ui/editorUi.js";
import { mountGameShell, resizeGameShell } from "./ui/mountGameShell.js";
import { GAME_LAUNCHERS } from "../../Libraries/Game/gameLaunch.js";
import { drawLabFrame, shouldRenderLabFrame } from "./ui/preview.js";
import { flushMapOverviewRepaint } from "./ui/mapOverview.js";
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
    return {
        updatePropFrame(prop, dt, frame) {
            prop.tickPropFrame(dt, state, frame);
        },
        updatePropSubstep(prop, subDt) {
            prop.tickPropSubstep(subDt);
        },
        resolveWalls(entity, frame) {
            const session = state.appLaunch?.session;
            if (session?.resolveWalls) return session.resolveWalls(entity, frame);
            return resolveKineticWallDamage(state, entity, frame, state.wallResolver);
        },
        applyContactSideEffects(tick, contacts) {
            tick.world.fractureEngine.processKineticContactFractures(tick, contacts, { onCircleFracture: (world, prop) => clearChainLinksForProp(world, prop.id) });
        },
        afterKineticPhysics(tick, dt) {
            state.appLaunch?.session?.afterKineticPhysics?.();
            const flushResult = flushPendingWallDamage(state);
            if (flushResult?.spawned?.length) state.fractureEngine.wallDebris.integrateSpawned(tick.frame, flushResult.spawned, dt);
        },
    };
}
/** @param {import("./state.js").TileLabGameState} state @param {import("../../Libraries/Spatial/spatial.js").KineticSpatialFrame} frame */
function kineticTickFromState(state, frame) {
    return { frame, world: { worldProps: state.worldProps, entityRegistry: state.entityRegistry, kinetic: state.kinetic, sandbox: state.sandbox, simulationFrameHooks: state.simulationFrameHooks, fractureEngine: state.fractureEngine } };
}
/** @param {import("./state.js").TileLabGameState} state @param {number} dt */
function runSimulationTick(state, dt) {
    const simDt = dt * state.selectedSpeed;
    state.gameTime += simDt;
    const spatialFrame = kineticSpatial.begin(state);
    FloorBelt.tick(state, spatialFrame, simDt, applyKineticAcceleration);
    runKineticPhysics(kineticTickFromState(state, spatialFrame), simDt, simulationKineticHooks(state));
    FloorBelt.syncAnimFromBodies(state, spatialFrame, simDt);
    FloatingText.updateAll(state, simDt);
}
export function createEditorApp(options = {}) {
    const gameLaunchId = options.gameLaunchId ?? null;
    const launcher = gameLaunchId ? GAME_LAUNCHERS[gameLaunchId] : null;
    if (gameLaunchId && !launcher) throw new Error(`Unknown game launch id: ${gameLaunchId}`);
    const gameMode = launcher != null;
    const useGameShell = gameMode && launcher.hideEditor;
    const state = new TileLabGameState();
    registerMapGenBoundsGridExpansionListener(state);
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
        if (!launcher.hideEditor) {
            document.body.classList.add("hide-sidebar");
            state.editor.showMapOverview = false;
        }
    }
    if (!document.getElementById("tilelab-css")) {
        const link = document.createElement("link");
        link.id = "tilelab-css";
        link.rel = "stylesheet";
        link.href = new URL("./tilelab.css", import.meta.url).href;
        document.head.appendChild(link);
    }
    installEditorDefaults(state);
    state.gridWallDamage = createGridWallDamage(state, { minBreakStrength: 0.1, referenceMaxSpeed: 560, minStrikeSpeed: 28 });
    const pauseManager = new PauseManager(state);
    installRadioOverlay(document.getElementById("gameWrapper"), { eventBus: events, requestPause: (reason) => pauseManager.pause(reason), requestResume: (reason) => pauseManager.resume(reason), content: { conversations: {}, speakers: {}, mainCharacterId: "player" } });
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
        if (!useGameShell) flushEditorLayoutResize(state);
        state.scheduler.update(dt);
        if (useGameShell) tickGameViewportNavigation(dt);
        else tickLabViewportNavigation(dt);
        tickSandboxCameraFollow(state.viewport, state, state.entityRegistry, dt);
        state.appLaunch?.session?.tick(dt);
        state.sandbox.controller?.tick(dt);
        if (!state.isPaused) runSimulationTick(state, dt);
        else {
            kineticSpatial.begin(state);
            FloatingText.updateAll(state, dt);
        }
        if (shouldRenderLabFrame(state)) drawLabFrame(state);
        if (!useGameShell) flushMapOverviewRepaint(state);
        requestAnimationFrame(loop);
    }
    events.on(FLOATING_TEXT_SPAWN_EVENT, FloatingText.handleSpawnEvent);
    if (!useGameShell) events.on(Events.UI_UPDATE, () => refreshEditorUi(state));
    window.addEventListener("resize", () => {
        if (useGameShell) resizeGameShell(state);
        else resizeEditorLayout(state);
        state.viewport.setCanvasSize(state.editor.canvas.width, state.editor.canvas.height);
    });
    if (useGameShell) void mountGameShell(state, launcher, { playbackHandlers });
    else mountEditorUi(state, { playbackHandlers });
    if (!useGameShell) {
        state.viewport.setCanvasSize(state.editor.canvas.width, state.editor.canvas.height);
        fitLabStageToView(state);
    }
    requestAnimationFrame(loop);
}
