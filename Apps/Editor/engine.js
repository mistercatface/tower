import { roguelikeProceduralDesign } from "../../Libraries/WorldGen/presets/roguelikeMap.js";
import { playBoundsFromObstacleGrid } from "../../Libraries/WorldGen/playBounds.js";
import { GUN_ID_TO_VISUAL } from "../../Assets/guns/visualMap.js";
import { createDefaultRenderPorts } from "../../Libraries/Render/defaultRenderPorts.js";
import { createWeaponVisuals } from "../../Libraries/Render/Characters/weapons/createWeaponVisuals.js";
import { getGameState } from "../../GameState/GameState.js";
import { pickupStates } from "../../Entities/PickupStates.js";
import { combatPickupStates } from "../../Entities/pickupCombatStates.js";
import { installGameState } from "../../GameState/GameState.js";
import { events, requestUiUpdate, Events } from "../../Core/EventSystem.js";
import { PauseManager } from "../../Libraries/Pause/index.js";
import { installEngineGlobals } from "../../Core/engineGlobals.js";
import { adjustSelectedSpeed, bindPlayback, resolveStep } from "../../Libraries/Playback/playbackController.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
import { createSimulationPort } from "../../Systems/Simulation/SimulationPipeline.js";
import { CombatParticles } from "../../Libraries/Render/CombatParticles.js";
import { sandboxInteractionPairs } from "../../Libraries/Combat/sandboxInteraction.js";
import { sandboxTargeting } from "../../Libraries/Combat/sandboxTargeting.js";
import { combatParticlesPhase, dispatchEventsPhase, projectilesPhase, ragdollCorpsePhase, sandboxAutoCombatPhase } from "../../Libraries/Combat/simulationPhases.js";
import { pushablePhysicsPhase } from "../../Systems/Simulation/phases.js";
import { FLOATING_TEXT_SPAWN_EVENT, FloatingText } from "../../Libraries/Render/FloatingText.js";
import { drawSandboxAssemblySurfaces } from "../../Libraries/Sandbox/assemblySurfaceDraw.js";
import { TileLabGameState } from "./state.js";
import { tilelabGroundZoneEffectPass, tilelabGroundZonePhase } from "./groundZones.js";
import { sandboxVoidZoneEffectPass, sandboxVoidZonePhase } from "./sandboxVoidZones.js";
import { sandboxController } from "./world/tilelabSandbox.js";
import { fitLabStageToView } from "./ui/labViewport.js";
import { tilelabUiPort } from "./ui/tilelabUiPort.js";
import { renderTilelabPreview } from "./ui/preview.js";
/** @typedef {{ togglePause: () => void, adjustSpeed: (delta: number) => void }} PlaybackHandlers */
/** Editor engine profile — shared render/sim/world-gen hooks. */
export const engine = {
    id: "editor",
    interactionPairs: sandboxInteractionPairs,
    targeting: sandboxTargeting,
    render: {
        ...createDefaultRenderPorts({ weaponVisuals: createWeaponVisuals(GUN_ID_TO_VISUAL) }),
        drawGroundOverlays: (state, viewport, ctx) => drawSandboxAssemblySurfaces(ctx, state, viewport),
        drawPostSimulation: (state, viewport, ctx) => CombatParticles.renderAll(ctx, state, viewport),
        simulationEffectPasses: [
            sandboxVoidZoneEffectPass,
            tilelabGroundZoneEffectPass,
            {
                zIndex: 65,
                draw(_state, _viewport, ctx) {
                    sandboxController.drawPathOverlay(ctx);
                    sandboxController.drawLaunchPreview(ctx);
                },
            },
        ],
    },
    worldGen: {
        nodeWorldCoordScale: 1,
        strategies: {},
        generateWorld() {},
        getPlayBounds(state) {
            return playBoundsFromObstacleGrid(state.obstacleGrid);
        },
    },
    worldSurface: { pixelsPerCell: 6 },
    proceduralDesign: roguelikeProceduralDesign,
    viewPort: {
        getViewCenter(state) {
            return { x: state.viewport.x, y: state.viewport.y };
        },
    },
    simulationPort: createSimulationPort(
        [
            {
                id: "sandboxTick",
                run(ctx, dt) {
                    sandboxController.tick(dt);
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
    ),
    /** @type {PlaybackHandlers} */
    playbackHandlers: { togglePause() {}, adjustSpeed() {} },
    onCanvasResize() {
        const state = getGameState();
        state.viewport.setCanvasSize(state.labCanvas.width, state.labCanvas.height);
    },
};
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
    installEngineGlobals(engine, state);
    bindPlayback(engine.playback);
    const pauseManager = new PauseManager(state);
    engine.playbackHandlers = {
        togglePause() {
            pauseManager.toggleUser();
            requestUiUpdate();
        },
        adjustSpeed(delta) {
            adjustSelectedSpeed(state, delta);
            requestUiUpdate();
        },
    };
    const simulation = engine.simulationPort;
    function tickSimulation(dt) {
        if (state.isPaused) return;
        simulation.runTick({ state }, dt);
    }
    function drawFrame() {
        renderTilelabPreview(state);
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
    function resizeCanvas() {
        engine.onCanvasResize();
    }
    events.on(FLOATING_TEXT_SPAWN_EVENT, FloatingText.handleSpawnEvent);
    events.warnOnMissingListeners = true;
    events.on(Events.UI_UPDATE, () => tilelabUiPort.updateUI({ state }));
    window.addEventListener("resize", resizeCanvas);
    tilelabUiPort.mount({ state });
    resizeCanvas();
    fitLabStageToView(state);
    requestAnimationFrame(loop);
}
