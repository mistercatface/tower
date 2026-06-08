import { createSimulationPort } from "../../Systems/Simulation/SimulationPipeline.js";
import { gameSceneTickPhase, pushablePhysicsPhase } from "../../Systems/Simulation/phases.js";
import { getTilelabSandboxController } from "./world/tilelabSandbox.js";
import { RagdollCorpse } from "../../Entities/RagdollCorpse.js";
import { Projectile } from "../../Entities/Projectile.js";
import { Explosion } from "../../Entities/Explosion/Explosion.js";
import { CombatParticles } from "../../Libraries/Render/CombatParticles.js";
const sandboxTickPhase = {
    run(ctx, dt) {
        getTilelabSandboxController()?.tick(dt);
    },
};
const projectilesPhase = {
    run(ctx, dt, runtime) {
        if (!ctx.state.projectiles) return;
        Projectile.checkSpawnCollisions(ctx.state, runtime.spatialFrame, runtime.events);
        Projectile.updateAll(ctx.state, dt);
    },
};
const particlesPhase = {
    run(ctx, dt, runtime) {
        CombatParticles.updateAll(ctx.state, dt);
    },
};
const explosionsPhase = {
    run(ctx, dt, runtime) {
        if (!ctx.state.explosions) return;
        Explosion.updateAll(ctx.state, dt, runtime.events, runtime.spatialFrame);
    },
};
const dispatchEventsPhase = {
    run(ctx, _dt, runtime) {
        for (const event of runtime.events) if (event.target?.handleHit) event.target.handleHit(event.damage, ctx, event.type, event);
    },
};
const ragdollTickPhase = {
    run(ctx, dt, runtime) {
        RagdollCorpse.updateAll(ctx.state, dt, runtime.spatialFrame);
    },
};
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationPort} */
export const tilelabSimulation = createSimulationPort([
    sandboxTickPhase,
    projectilesPhase,
    explosionsPhase,
    particlesPhase,
    pushablePhysicsPhase,
    ragdollTickPhase,
    dispatchEventsPhase,
    gameSceneTickPhase,
]);
