import { FloatingText } from "../../Render/FloatingText.js";
import { CombatParticles } from "../../Render/CombatParticles.js";
import { RagdollCorpse } from "../../Entities/RagdollCorpse.js";
import { Projectile } from "../../Entities/Projectile.js";
import { Explosion } from "../../Entities/Explosion/Explosion.js";
import { getRunScenePort } from "../../Core/GamePorts.js";
import { runPushablePhysics } from "./pushablePhysics.js";
import { dispatchSimulationEvents } from "./dispatchSimulationEvents.js";
/** @typedef {import("./SimulationRuntime.js").SimulationRuntime} SimulationRuntime */
/** @typedef {{ run: (ctx: object, dt: number, runtime: SimulationRuntime) => void }} SimulationPhase */
/** @type {SimulationPhase} */
export const gameSceneTickPhase = {
    run(ctx, dt) {
        getRunScenePort().onTick(ctx, dt);
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
export const worldSurfacePhase = {
    run(ctx) {
        ctx.state.worldSurfaces.updateFills();
    },
};
