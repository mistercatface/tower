import { getWorldPropRecipes } from "../Content/PropCatalog.js";
import { createDefaultKinematicsPorts } from "../Kinematics/kinematicsPorts.js";
/**
 * @param {Parameters<typeof createDefaultKinematicsPorts>[0]} [kinematicsOptions]
 */
export function createDefaultRenderPorts(kinematicsOptions = {}) {
    return {
        get world3dPropRecipes() {
            return getWorldPropRecipes();
        },
        kinematicsPorts: createDefaultKinematicsPorts({ gunIdToVisual: {}, ...kinematicsOptions }),
    };
}
