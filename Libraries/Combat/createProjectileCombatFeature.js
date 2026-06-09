import { projectilesPhase, sandboxAutoCombatPhase } from "./simulationPhases.js";
export function createProjectileCombatFeature({ projectileZIndex = 20 } = {}) {
    return {
        initState(state) {
            state.projectiles = state.projectiles ?? [];
            state.activeLasers = state.activeLasers ?? [];
            if (!state.entityLayers.some((layer) => layer.key === "projectiles")) state.entityLayers.push({ key: "projectiles", zIndex: projectileZIndex });
        },
        simulationPhaseInsertAfter: "sandboxTick",
        simulationPhases: [sandboxAutoCombatPhase, projectilesPhase],
    };
}
