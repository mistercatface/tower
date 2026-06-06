import { FloatingText } from "../../Render/FloatingText.js";
import { CombatParticles } from "../../Render/CombatParticles.js";
import { RagdollCorpse } from "../../Entities/RagdollCorpse.js";
import { ProgressionManager } from "../../Progression/ProgressionManager.js";
import { Projectile } from "../../Entities/Projectile.js";
import { Explosion } from "../../Entities/Explosion/Explosion.js";
import { getActiveGameDefinition } from "../../Core/ActiveGameDefinition.js";
import { runPushablePhysics } from "./pushablePhysics.js";
import { dispatchSimulationEvents } from "./dispatchSimulationEvents.js";
/** @typedef {import("./SimulationRuntime.js").SimulationRuntime} SimulationRuntime */
/** @typedef {{ run: (ctx: object, dt: number, runtime: SimulationRuntime) => void }} SimulationPhase */
/** @type {SimulationPhase} */
export const abilitiesPhase = {
    run(ctx, dt, runtime) {
        runtime.abilityState = ProgressionManager.updateAbilities(ctx.state, dt, ctx.upgrades);
    },
};
/** @type {SimulationPhase} */
export const playerLocomotionPhase = {
    run(ctx, dt, runtime) {
        const { state, upgrades } = ctx;
        const abilityState = runtime.abilityState ?? { isDiving: false, externalSpeedMod: 1 };
        if (!abilityState.isDiving && state.player.applyQueuedTarget(state)) state.navigation.rebuildPlayerFlowField(state.player.targetX, state.player.targetY);
        state.updateAllCombatants(dt, runtime.spatialFrame, { externalSpeedMod: abilityState.externalSpeedMod, upgrades, combatEvents: runtime.events });
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
export const gameSceneTickPhase = {
    run(ctx, dt) {
        getActiveGameDefinition()?.onRunSceneTick?.(ctx, dt);
    },
};
/** @type {SimulationPhase} */
export const hordePhase = {
    run(ctx, dt) {
        ctx.state.hordeSpawner.manageSpawning(dt, ctx.state, ctx.upgrades);
    },
};
/** @type {SimulationPhase} */
export const projectilesPhase = {
    run(ctx, dt, runtime) {
        Projectile.checkSpawnCollisions(ctx.state, runtime.spatialFrame, runtime.events);
        Projectile.updateAll(ctx.state, dt);
    },
};
/** @type {SimulationPhase} */
export const particlesPhase = {
    run(ctx, dt, runtime) {
        CombatParticles.updateAll(ctx.state, dt);
        RagdollCorpse.updateAll(ctx.state, dt, runtime.spatialFrame);
    },
};
/** @type {SimulationPhase} */
export const pushablePhysicsPhase = {
    run(ctx, dt, runtime) {
        runPushablePhysics(ctx.state, dt, runtime.spatialFrame, runtime.events);
    },
};
/** @type {SimulationPhase} */
export const explosionsPhase = {
    run(ctx, dt, runtime) {
        Explosion.updateAll(ctx.state, dt, runtime.events, runtime.spatialFrame);
    },
};
/** @type {SimulationPhase} */
export const dispatchEventsPhase = {
    run(ctx, _dt, runtime) {
        dispatchSimulationEvents(runtime.events, ctx);
    },
};
/** @type {SimulationPhase} */
export const floatingTextPhase = {
    run(ctx, dt) {
        FloatingText.updateAll(ctx.state, dt);
    },
};
/** @type {SimulationPhase} */
export const upgradesPhase = {
    run(ctx, dt) {
        ctx.upgrades.forEach((upg) => upg.update(dt, ctx.state));
    },
};
/** @type {SimulationPhase} */
export const levelUpsPhase = {
    run(ctx) {
        ProgressionManager.processLevelUps(ctx.state, ctx.upgrades);
    },
};
/** @type {SimulationPhase} */
export const worldSurfacePhase = {
    run(ctx) {
        ctx.state.worldSurfaces.updateFills();
    },
};
/** @type {SimulationPhase} */
export const inspectorPartyPhase = {
    run(ctx, dt, runtime) {
        const { state, upgrades } = ctx;
        const abilityState = runtime.abilityState ?? { isDiving: false, externalSpeedMod: 1 };
        if (!abilityState.isDiving && state.player.applyQueuedTarget(state)) state.navigation.rebuildPlayerFlowField(state.player.targetX, state.player.targetY);
        const partyOpts = { externalSpeedMod: abilityState.externalSpeedMod, upgrades, blocksTargeting: true };
        for (const actor of state.getPlayerActors()) actor.updateCombat(dt, state, runtime.spatialFrame, partyOpts);
    },
};
