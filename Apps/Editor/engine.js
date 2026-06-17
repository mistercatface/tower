import { installGameState } from "../../GameState/GameState.js";
import { events, requestUiUpdate, Events } from "../../Core/EventSystem.js";
import { PauseManager } from "../../Libraries/Pause/index.js";
import { installEditorDefaults } from "../../Core/engineGlobals.js";
import { adjustSelectedSpeed } from "../../Libraries/Playback/playbackController.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
import { CombatParticles } from "../../Libraries/Render/CombatParticles.js";
import { updateSandboxAutoCombat } from "../../Libraries/Combat/worldPropAutoCombat.js";
import { Projectile } from "../../Entities/Projectile.js";
import { RagdollCorpse } from "../../Entities/RagdollCorpse.js";
import { runPushablePhysics } from "../../Libraries/Motion/pushablePhysicsPass.js";
import { tickVisibleKinematicsAnim } from "../../Libraries/Render/Characters/actorKinematicsRenderer.js";
import { FLOATING_TEXT_SPAWN_EVENT, FloatingText } from "../../Libraries/Render/FloatingText.js";
import { TileLabGameState } from "./state.js";
import { tickFloorProps } from "../../Libraries/Sandbox/floorProps.js";
import { tickFloorOccupancy } from "../../Libraries/Sandbox/floorOccupancy.js";
import { tickGridZones } from "../../Libraries/Sandbox/gridZoneTick.js";
import { installRadioOverlay } from "../../Libraries/Radio/installRadioOverlay.js";
import { tickSandboxCameraFollow } from "../../Libraries/Sandbox/sandboxCameraTarget.js";
import { fitLabStageToView, tickLabViewportNavigation } from "./ui/labViewport.js";
import { mountEditorUi, refreshEditorUi, resizeEditorLayout, flushEditorLayoutResize } from "./ui/editorUi.js";
import { drawLabFrame, shouldRenderLabFrame } from "./ui/preview.js";
import { flushMapOverviewRepaint } from "./ui/mapOverview.js";
import { tickAnimationPreview } from "./ui/LabAnimationPreview.js";
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
    updateSandboxAutoCombat(state, simDt);
    Projectile.checkSpawnCollisions(state, spatialFrame, simulationEvents);
    Projectile.updateAll(state, simDt);
    CombatParticles.updateAll(state, simDt);
    tickFloorProps(state, spatialFrame, simDt);
    tickFloorOccupancy(state, spatialFrame, simDt);
    runPushablePhysics(state, simDt, spatialFrame, simulationEvents);
    tickGridZones(state, spatialFrame);
    tickVisibleKinematicsAnim(state, simDt, spatialFrame);
    RagdollCorpse.updateAll(state, simDt, spatialFrame);
    dispatchSimulationEvents(simulationEvents, state);
    FloatingText.updateAll(state, simDt);
}
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
    document.title = "Editor";
    document.body.classList.add("shell-tilelab");
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
        flushEditorLayoutResize(state);
        state.scheduler.update(dt);
        tickLabViewportNavigation(dt);
        tickSandboxCameraFollow(state.viewport, state, state.entityRegistry, dt);
        state.sandbox.controller?.tick(dt);
        if (!state.isPaused) runSimulationTick(state, dt);
        if (shouldRenderLabFrame(state)) drawLabFrame(state);
        tickAnimationPreview(timestamp);
        flushMapOverviewRepaint(state);
        requestAnimationFrame(loop);
    }
    events.on(FLOATING_TEXT_SPAWN_EVENT, FloatingText.handleSpawnEvent);
    events.on(Events.UI_UPDATE, () => refreshEditorUi(state));
    window.addEventListener("resize", () => {
        resizeEditorLayout(state);
        state.viewport.setCanvasSize(state.editor.canvas.width, state.editor.canvas.height);
    });
    mountEditorUi(state, { playbackHandlers });
    state.viewport.setCanvasSize(state.editor.canvas.width, state.editor.canvas.height);
    fitLabStageToView(state);
    requestAnimationFrame(loop);
}
