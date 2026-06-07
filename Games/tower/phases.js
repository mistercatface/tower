import { isSimulation } from "../../GameState/GamePhase.js";
import { runSceneController } from "./config/runScenes.js";
import { ProgressionManager } from "./progression/ProgressionManager.js";
/** @typedef {import("../../Systems/Simulation/SimulationRuntime.js").SimulationRuntime} SimulationRuntime */
/** @typedef {{ run: (ctx: object, dt: number, runtime: SimulationRuntime) => void }} SimulationPhase */
/** @type {SimulationPhase} */
export const hordePhase = {
    run(ctx, dt) {
        if (!isSimulation(ctx.state.phase)) return;
        if (runSceneController.getCurrentCapabilities().horde !== true) return;
        ctx.state.hordeSpawner.manageSpawning(dt, ctx.state);
    },
};
/** @type {SimulationPhase} */
export const abilitiesPhase = {
    run(ctx, dt, runtime) {
        runtime.abilityState = ProgressionManager.updateAbilities(ctx.state, dt);
    },
};
/** @type {SimulationPhase} */
export const upgradesPhase = {
    run(ctx, dt) {
        for (const upg of ctx.state.upgradeDefs ?? []) upg.update(dt, ctx.state);
    },
};
/** @type {SimulationPhase} */
export const levelUpsPhase = {
    run(ctx) {
        ProgressionManager.processLevelUps(ctx.state);
    },
};
/** @type {SimulationPhase} */
export const playerLocomotionPhase = {
    run(ctx, dt, runtime) {
        const { state } = ctx;
        const abilityState = runtime.abilityState ?? { isDiving: false, externalSpeedMod: 1 };
        if (!abilityState.isDiving && state.player.applyQueuedTarget(state)) state.navigation.rebuildPlayerFlowField(state.player.targetX, state.player.targetY);
        state.updateAllCombatants(dt, runtime.spatialFrame, { externalSpeedMod: abilityState.externalSpeedMod, combatEvents: runtime.events });
    },
};
/** @type {SimulationPhase} */
export const flowFieldPhase = {
    run(ctx, _dt, runtime) {
        const { state } = ctx;
        const oldGridPos = state.flowFieldGrid.worldToGrid(state.player.x, state.player.y);
        state.navigation.updateFlowField({
            playerX: state.player.x,
            playerY: state.player.y,
            playerTargetX: state.player.isMoving ? state.player.targetX : null,
            playerTargetY: state.player.isMoving ? state.player.targetY : null,
            previousGridPos: oldGridPos,
        });
    },
};
/** @type {SimulationPhase} */
export const inspectorPartyPhase = {
    run(ctx, dt, runtime) {
        const { state } = ctx;
        const abilityState = runtime.abilityState ?? { isDiving: false, externalSpeedMod: 1 };
        if (!abilityState.isDiving && state.player.applyQueuedTarget(state)) state.navigation.rebuildPlayerFlowField(state.player.targetX, state.player.targetY);
        const partyOpts = { externalSpeedMod: abilityState.externalSpeedMod, blocksTargeting: true };
        for (const actor of state.getPlayerActors()) actor.updateCombat(dt, state, runtime.spatialFrame, partyOpts);
    },
};
