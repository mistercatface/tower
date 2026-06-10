import { engine } from "./engine.js";
import { TileLabGameState } from "./state.js";
import { pickupStates } from "../../Entities/PickupStates.js";
import { combatPickupStates } from "../../Entities/pickupCombatStates.js";
import { installGameState, peekGameState } from "../../GameState/GameState.js";
import { events, requestUiUpdate, Events } from "../../Core/EventSystem.js";
import { registerPauseListeners, PauseManager } from "../../Core/PauseManager.js";
import { adjustSelectedSpeed } from "../../Libraries/Playback/index.js";
import { installGameSurfaceProfileProvider } from "../../Config/procedural/bootstrap.js";
import { getGameWorldSurfaceSettings, installGameWorldSurfaceSettings, TILE_WORKER_URL } from "../../Render/WorldSurfaceBootstrap.js";
import { configureTileWorkerCoordinator } from "../../Libraries/WorldSurface/TileWorkerCoordinator.js";
import { clearInteractionPairFilterCache } from "../../Core/GamePorts.js";
import { applyGamePerspective } from "../../Core/GamePerspective.js";
import { applyGameProceduralDesign, resolveProceduralBakeSettings } from "../../Core/GameProceduralDesign.js";
import { applyGameCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { applyGamePropPixelSize } from "../../Core/GamePropPixelSize.js";
import { applyGamePropQuantizeSettings } from "../../Core/GamePropQuantizeSettings.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
import { createSimulationPort } from "../../Systems/Simulation/SimulationPipeline.js";
import { CombatParticles } from "../../Libraries/Render/CombatParticles.js";
import { sandboxInteractionPairs } from "../../Libraries/Combat/sandboxInteraction.js";
import { sandboxTargeting } from "../../Libraries/Combat/sandboxTargeting.js";
import {
    combatParticlesPhase,
    dispatchEventsPhase,
    projectilesPhase,
    ragdollCorpsePhase,
    sandboxAutoCombatPhase,
} from "../../Libraries/Combat/simulationPhases.js";
import { pushablePhysicsPhase } from "../../Systems/Simulation/phases.js";
import { FLOATING_TEXT_SPAWN_EVENT, FloatingText } from "../../Libraries/Render/FloatingText.js";
import { tilelabGroundZonePhase } from "./groundZones.js";
import { sandboxVoidZonePhase } from "./sandboxVoidZones.js";
import { getTilelabSandboxController } from "./world/tilelabSandbox.js";
import { initEmptyTilelabMap } from "./world/mapWorld.js";
import { registerEditorProfiles } from "./ui/preview.js";
import { syncPreviewZoomToStage } from "./ui/toolbar.js";
import { tilelabUiPort } from "./ui/tilelabUiPort.js";
import { renderTilelabPreview } from "./ui/preview.js";
import { readControls } from "./ui/toolbar.js";

let workersConfigured = false;

engine.interactionPairs = sandboxInteractionPairs;
engine.targeting = sandboxTargeting;
engine.simulationPort = createSimulationPort(
    [
        {
            id: "sandboxTick",
            run(ctx, dt) {
                getTilelabSandboxController()?.tick(dt);
            },
        },
        sandboxAutoCombatPhase,
        projectilesPhase,
        combatParticlesPhase,
        pushablePhysicsPhase,
        ragdollCorpsePhase,
        dispatchEventsPhase,
        sandboxVoidZonePhase,
        tilelabGroundZonePhase,
        {
            id: "floatingText",
            run(ctx, dt) {
                FloatingText.updateAll(ctx.state, dt);
            },
        },
    ],
    {
        beginRuntime(ctx) {
            return { spatialFrame: combatSpatial.begin(ctx.state), events: [] };
        },
    },
);
engine.render.drawPostSimulation = (state, viewport, ctx) => {
    CombatParticles.renderAll(ctx, state, viewport);
};

function initSharedEngineRuntime() {
    clearInteractionPairFilterCache();
    installGameSurfaceProfileProvider(engine);
    if (!workersConfigured) {
        configureTileWorkerCoordinator({ workerUrl: TILE_WORKER_URL });
        workersConfigured = true;
    }
    applyGameProceduralDesign(engine);
    const perspective = applyGamePerspective(engine);
    installGameWorldSurfaceSettings({
        cameraHeight: perspective.cameraHeight,
        pixelsPerCell: engine.worldSurface?.pixelsPerCell,
        wallHeight: engine.worldSurface?.wallHeight,
        ...resolveProceduralBakeSettings(engine),
    });
    applyGameCollisionSettings(engine);
    applyGamePropQuantizeSettings(engine);
    applyGamePropPixelSize(engine);
    const state = peekGameState();
    if (!state?.worldSurfaces) return;
    const worldSurfaces = state.worldSurfaces;
    const settings = getGameWorldSurfaceSettings();
    const prev = worldSurfaces.settings;
    const keysToCheck = ["animationBakeMaxFrames", "pixelsPerCell", "wallHeight", "cameraHeight"];
    const bakeSettingsChanged =
        keysToCheck.some((key) => prev[key] !== settings[key]) ||
        JSON.stringify(prev.roofZLevels ?? []) !== JSON.stringify(settings.roofZLevels ?? []);
    worldSurfaces.settings = settings;
    if (bakeSettingsChanged) worldSurfaces.clear();
}

/** Editor boot — engine setup, UI mount, RAF loop. */
export function createEditorApp() {
    const state = new TileLabGameState();
    state.entityLayers = state.entityLayers ?? [];
    state.combatParticles = state.combatParticles ?? [];
    state.projectiles = state.projectiles ?? [];
    state.activeLasers = state.activeLasers ?? [];
    state.floatingTexts = state.floatingTexts ?? [];
    if (!state.entityLayers.some((layer) => layer.key === "projectiles")) state.entityLayers.push({ key: "projectiles", zIndex: 20 });
    if (!state.entityLayers.some((layer) => layer.key === "floatingTexts")) state.entityLayers.push({ key: "floatingTexts", zIndex: 100 });
    installGameState(state);
    for (const key of Object.keys(pickupStates)) if (key !== "normal") delete pickupStates[key];
    Object.assign(pickupStates, combatPickupStates);
    document.title = "Editor";
    document.body.classList.add("shell-tilelab");
    if (!document.getElementById("tilelab-css")) {
        const link = document.createElement("link");
        link.id = "tilelab-css";
        link.rel = "stylesheet";
        link.href = new URL("./tilelab.css", import.meta.url).href;
        document.head.appendChild(link);
    }
    initSharedEngineRuntime();
    const viewport = state.viewport;
    const simulation = engine.simulationPort;
    const pauseManager = new PauseManager(state);
    function tickSimulation(dt) {
        if (state.isPaused) return;
        simulation.runTick({ state }, dt);
    }
    function drawFrame() {
        renderTilelabPreview(state, readControls(state));
    }
    function loop(timestamp) {
        if (state.lastTime === 0) state.lastTime = timestamp;
        let dt = timestamp - state.lastTime;
        state.lastTime = timestamp;
        dt = Math.min(dt, 50);
        state.scheduler.update(dt);
        if (!state.isPaused) {
            state.gameTime += dt * state.selectedSpeed;
            tickSimulation(dt * state.selectedSpeed);
        }
        drawFrame();
        requestAnimationFrame(loop);
    }
    function enterEditor() {
        initEmptyTilelabMap(state);
        registerEditorProfiles(state).then(() => syncPreviewZoomToStage(state));
        requestUiUpdate();
    }
    function resizeCanvas() {
        engine.onCanvasResize?.();
    }
    registerPauseListeners(events, pauseManager);
    events.on(Events.GAME_TOGGLE_PAUSE, () => requestUiUpdate());
    events.on(Events.GAME_SET_SPEED, ({ state: speedState, delta }) => {
        adjustSelectedSpeed(speedState, delta, engine);
        requestUiUpdate();
    });
    events.on(FLOATING_TEXT_SPAWN_EVENT, FloatingText.handleSpawnEvent);
    events.setContext({ state, viewport });
    events.warnOnMissingListeners = true;
    events.on(Events.UI_UPDATE, () => tilelabUiPort.updateUI({ state }));
    window.addEventListener("resize", resizeCanvas);
    window.gameState = state;
    tilelabUiPort.mount({ state });
    resizeCanvas();
    enterEditor();
    requestAnimationFrame(loop);
}
