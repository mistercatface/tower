import { pickupStates } from "../../../Entities/PickupStates.js";
import { PickupZoneAffectedState } from "./PickupZoneAffectedState.js";
import { processPropZones } from "./processPropZones.js";

/** @returns {import("../../../Core/GameDefinitionTypes.js").GameFeature} */
export function createPropZoneFeature() {
    return {
        prepare() {
            pickupStates.zoneAffected = new PickupZoneAffectedState();
        },
        simulationPhaseInsertAfter: "sandboxTick",
        simulationPhases: [
            {
                id: "propZones",
                run(ctx, dt) {
                    processPropZones(ctx.state, dt);
                },
            },
        ],
    };
}
