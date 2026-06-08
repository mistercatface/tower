import { registerPickupStates } from "../../Entities/PickupStates.js";
import { combatPickupStates } from "../../Entities/pickupCombatStates.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
import { sandboxInteractionPairs } from "./sandboxInteraction.js";
import { sandboxTargeting } from "./sandboxTargeting.js";
export function createSandboxCombatInfraFeature() {
    return {
        interactionPairs: sandboxInteractionPairs,
        targeting: sandboxTargeting,
        beginRuntime(ctx) {
            return { spatialFrame: combatSpatial.begin(ctx.state), events: [] };
        },
        prepare() {
            registerPickupStates(combatPickupStates);
        },
    };
}
