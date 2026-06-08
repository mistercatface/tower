import { getWorldPropRecipes } from "../Props/PropCatalog.js";
import { createDefaultKinematicsPorts } from "../Kinematics/kinematicsPorts.js";
import { createExplosionSimulationEffectPass } from "./explosionDraw.js";
import { createLiveWorldStructure } from "./worldStructure/LiveWorldStructure.js";
/**
 * @param {Parameters<typeof createDefaultKinematicsPorts>[0]} [kinematicsOptions]
 */
import { CombatParticles } from "./CombatParticles.js";
export function createDefaultRenderPorts(kinematicsOptions = {}) {
    return {
        get world3dPropRecipes() {
            return getWorldPropRecipes();
        },
        kinematicsPorts: createDefaultKinematicsPorts(kinematicsOptions),
        worldStructure: createLiveWorldStructure(),
        simulationEffectPasses: [createExplosionSimulationEffectPass()],
        drawPostSimulation(state, viewport, ctx, renderer) {
            CombatParticles.renderAll(ctx, state, viewport);
        },
    };
}
