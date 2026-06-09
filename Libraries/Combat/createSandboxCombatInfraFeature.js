import { pickupStates } from "../../Entities/PickupStates.js";
import { combatPickupStates } from "../../Entities/pickupCombatStates.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
import { sandboxInteractionPairs } from "./sandboxInteraction.js";
import { sandboxTargeting } from "./sandboxTargeting.js";
export function createSandboxCombatInfraFeature() {
    return {
        initState(state) {
            state.entityLayers = state.entityLayers ?? [];
            state.combatParticles = state.combatParticles ?? [];
        },
        interactionPairs: sandboxInteractionPairs,
        targeting: sandboxTargeting,
        beginRuntime(ctx) {
            return { spatialFrame: combatSpatial.begin(ctx.state), events: [] };
        },
        prepare() {
            for (const key of Object.keys(pickupStates)) if (key !== "normal") delete pickupStates[key];
            Object.assign(pickupStates, combatPickupStates);
        },
    };
}
