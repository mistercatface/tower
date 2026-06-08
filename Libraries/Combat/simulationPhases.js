import { CombatParticles } from "../Render/CombatParticles.js";
import { RagdollCorpse } from "../../Entities/RagdollCorpse.js";
import { Projectile } from "../../Entities/Projectile.js";
import { Explosion } from "../../Entities/Explosion/Explosion.js";
/** @typedef {import("../../Systems/Simulation/SimulationRuntime.js").SimulationRuntime} SimulationRuntime */
/** @typedef {{ run: (ctx: object, dt: number, runtime?: SimulationRuntime) => void }} SimulationPhase */
function dispatchSimulationEvents(events, ctx) {
    for (const event of events) if (event.target?.handleHit) event.target.handleHit(event.damage, ctx, event.type, event);
}
/** @type {SimulationPhase} */
export const projectilesPhase = {
    run(ctx, dt, runtime) {
        Projectile.checkSpawnCollisions(ctx.state, runtime.spatialFrame, runtime.events);
        Projectile.updateAll(ctx.state, dt);
    },
};
/** @type {SimulationPhase} */
export const combatParticlesPhase = {
    run(ctx, dt) {
        CombatParticles.updateAll(ctx.state, dt);
    },
};
/** @type {SimulationPhase} */
export const ragdollCorpsePhase = {
    run(ctx, dt, runtime) {
        RagdollCorpse.updateAll(ctx.state, dt, runtime.spatialFrame);
    },
};
/** Combat particles + ragdoll corpses (tower keeps both in one phase for phase-order history). */
/** @type {SimulationPhase} */
export const particlesPhase = {
    run(ctx, dt, runtime) {
        combatParticlesPhase.run(ctx, dt, runtime);
        ragdollCorpsePhase.run(ctx, dt, runtime);
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
/**
 * Shared combat tick phases for prop/sandbox worlds.
 * Games insert sandbox/physics/scene phases around this block.
 * @returns {SimulationPhase[]}
 */
export function createCombatWorldPhases() {
    return [projectilesPhase, explosionsPhase, combatParticlesPhase, dispatchEventsPhase];
}
