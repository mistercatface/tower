import { getWorldPropRecipes } from "../Content/PropCatalog.js";
import { createDefaultKinematicsPorts } from "../Kinematics/kinematicsPorts.js";
import { createLiveWorldStructure } from "./worldStructure/LiveWorldStructure.js";
/**
 * @param {Parameters<typeof createDefaultKinematicsPorts>[0]} [kinematicsOptions]
 */
export function createDefaultRenderPorts(kinematicsOptions = {}) {
    return {
        get world3dPropRecipes() {
            return getWorldPropRecipes();
        },
        kinematicsPorts: createDefaultKinematicsPorts(kinematicsOptions),
        worldStructure: createLiveWorldStructure(),
    };
}
