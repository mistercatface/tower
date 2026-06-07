import { FloatingText } from "../../Render/FloatingText.js";
import { CombatParticles } from "../../Render/CombatParticles.js";
import { RagdollCorpse } from "./entities/RagdollCorpse.js";
import { Projectile } from "./entities/Projectile.js";
import { Explosion } from "./entities/Explosion/Explosion.js";
/** @typedef {import("../../Systems/Simulation/SimulationRuntime.js").SimulationRuntime} SimulationRuntime */
/** @typedef {{ run: (ctx: object, dt: number, runtime: SimulationRuntime) => void }} SimulationPhase */
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
export const particlesPhase = {
    run(ctx, dt, runtime) {
        CombatParticles.updateAll(ctx.state, dt);
        RagdollCorpse.updateAll(ctx.state, dt, runtime.spatialFrame);
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
