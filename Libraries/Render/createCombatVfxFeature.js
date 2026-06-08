import { combatParticlesPhase, explosionsPhase } from "../Combat/simulationPhases.js";
import { CombatParticles } from "./CombatParticles.js";
import { createExplosionSimulationEffectPass } from "./explosionDraw.js";
export function createCombatVfxFeature({ explosionZIndex = 60 } = {}) {
    return {
        initState(state) {
            state.explosions = state.explosions ?? [];
            state.combatParticles = state.combatParticles ?? [];
        },
        simulationPhaseInsertAfter: "projectiles",
        simulationPhases: [explosionsPhase, combatParticlesPhase],
        simulationEffectPasses: [createExplosionSimulationEffectPass(explosionZIndex)],
        drawPostSimulation(state, viewport, ctx) {
            CombatParticles.renderAll(ctx, state, viewport);
        },
    };
}
