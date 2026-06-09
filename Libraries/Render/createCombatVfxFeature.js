import { combatParticlesPhase } from "../Combat/simulationPhases.js";
import { CombatParticles } from "./CombatParticles.js";
export function createCombatVfxFeature() {
    return {
        initState(state) {
            state.combatParticles = state.combatParticles ?? [];
        },
        simulationPhaseInsertAfter: "projectiles",
        simulationPhases: [combatParticlesPhase],
        drawPostSimulation(state, viewport, ctx) {
            CombatParticles.renderAll(ctx, state, viewport);
        },
    };
}
