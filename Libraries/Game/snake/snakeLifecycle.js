import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { clearGroundRollDrive } from "../../Sandbox/kineticRollActuator.js";
import { clearSnakeSteeringLeaseFromProp } from "./snakeSteeringLease.js";
export function retireSnakeSegmentsFromNav(state, memberIds) {
    const meta = getSandboxEntityMeta(state);
    for (let i = 0; i < memberIds.length; i++) {
        const prop = state.entityRegistry.get(memberIds[i]);
        if (!prop) continue;
        meta.setChainHead(memberIds[i], false);
        if (prop._snakeSteering) clearSnakeSteeringLeaseFromProp(prop);
        else clearGroundRollDrive(prop);
        prop.navStepPenalty = null;
    }
}
