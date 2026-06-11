import { SURFACE_PROFILE_ID } from "../../Config/procedural/profileIds.js";
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
import { adjustSelectedSpeed, bindPlayback } from "../../Libraries/Playback/playbackController.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
import { CombatParticles } from "../../Libraries/Render/CombatParticles.js";
import { sandboxInteractionPairs } from "../../Libraries/Combat/sandboxInteraction.js";
import { sandboxTargeting } from "../../Libraries/Combat/sandboxTargeting.js";
import { updateSandboxAutoCombat } from "../../Libraries/Combat/pickupAutoCombat.js";
import { Projectile } from "../../Entities/Projectile.js";
import { RagdollCorpse } from "../../Entities/RagdollCorpse.js";
import { runPushablePhysics } from "../../Libraries/Motion/pushablePhysicsPass.js";
import { FLOATING_TEXT_SPAWN_EVENT, FloatingText } from "../../Libraries/Render/FloatingText.js";
import { drawSandboxAssemblySurfaces } from "../../Libraries/Sandbox/assemblySurfaceDraw.js";
import { TileLabGameState } from "./state.js";
import { tilelabGroundZoneEffectPass, tickTilelabGroundZones } from "./groundZones.js";
import { sandboxVoidZoneEffectPass, tickSandboxVoidZones } from "./sandboxVoidZones.js";
import { sandboxController } from "./world/tilelabSandbox.js";
import { tickSandboxCameraFollow } from "../../Libraries/Sandbox/sandboxCameraTarget.js";
import { fitLabStageToView } from "./ui/labViewport.js";
import { mountEditorUi, refreshEditorUi } from "./ui/editorUi.js";
import { drawLabFrame } from "./ui/preview.js";
const EDITOR_SURFACE_PROFILE_ID = SURFACE_PROFILE_ID.tomatoGarden;
/** @type {object[]} */
const simulationEvents = [];
/** @param {object[]} events @param {import("./state.js").TileLabGameState} state */
function dispatchSimulationEvents(events, state) {
    for (const event of events)
        if (event.target.handleHit) event.target.handleHit(event.damage, state, event.type, event);
        else if (event.target.takeDamage) event.target.takeDamage(event.damage, state);
}
/** @param {import("./state.js").TileLabGameState} state @param {number} dt */
function runSimulationTick(state, dt) {
    const simDt = dt * state.selectedSpeed;
    state.gameTime += simDt;
    const spatialFrame = combatSpatial.begin(state);
    simulationEvents.length = 0;
    sandboxController?.tick(dt);
    updateSandboxAutoCombat(state, simDt);
    Projectile.checkSpawnCollisions(state, spatialFrame, simulationEvents);
    Projectile.updateAll(state, simDt);
    CombatParticles.updateAll(state, simDt);
    runPushablePhysics(state, simDt, spatialFrame, simulationEvents);
    RagdollCorpse.updateAll(state, simDt, spatialFrame);
    dispatchSimulationEvents(simulationEvents, state);
    tickSandboxVoidZones(state, spatialFrame);
    tickTilelabGroundZones(state, spatialFrame);
    FloatingText.updateAll(state, simDt);
}
/** @typedef {{ togglePause: () => void, adjustSpeed: (delta: number) => void }} PlaybackHandlers */
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
                    sandboxController?.drawPathOverlay(ctx);
                    sandboxController?.drawLaunchPreview(ctx);
                },
            },
        ],
    },
    worldSurface: { pixelsPerCell: 6 },
    proceduralDesign: { surfaceProfileId: EDITOR_SURFACE_PROFILE_ID },
};
export function createEditorApp() {
    const state = new TileLabGameState();
    state.ragdollCorpses = [];
    state.entityLayers = [];
    state.combatParticles = [];
    state.projectiles = [];
    state.activeLasers = [];
    state.floatingTexts = [];
    state.entityLayers.push({ key: "projectiles", zIndex: 20 }, { key: "floatingTexts", zIndex: 100 });
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
    function loop(timestamp) {
        if (state.lastTime === 0) state.lastTime = timestamp;
        let dt = timestamp - state.lastTime;
        state.lastTime = timestamp;
        dt = Math.min(dt, 50);
        state.scheduler.update(dt);
        tickSandboxCameraFollow(state.viewport, state.pickups, dt);
        if (!state.isPaused) runSimulationTick(state, dt);
        drawLabFrame(state);
        requestAnimationFrame(loop);
    }
    events.on(FLOATING_TEXT_SPAWN_EVENT, FloatingText.handleSpawnEvent);
    events.on(Events.UI_UPDATE, () => refreshEditorUi(state));
    window.addEventListener("resize", () => state.viewport.setCanvasSize(state.labCanvas.width, state.labCanvas.height));
    mountEditorUi(state);
    state.viewport.setCanvasSize(state.labCanvas.width, state.labCanvas.height);
    fitLabStageToView(state);
    requestAnimationFrame(loop);
}
