import { HPA_GROUND_NAV_BEHAVIOR_ID } from "../groundNavIds.js";
import { getPropAsset } from "../../../Props/PropCatalog.js";
import { resolveSandboxBehaviors } from "../../sandboxCapabilities.js";
export function issueMassHpaGroundNav(state, behaviorById, behaviors, world, { getPropBehaviorId }) {
    const hpaBehavior = behaviorById.get(HPA_GROUND_NAV_BEHAVIOR_ID);
    let moved = 0;
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead) return;
        const allowed = resolveSandboxBehaviors(getPropAsset(prop.type), behaviors, state, prop);
        if (!allowed.includes(HPA_GROUND_NAV_BEHAVIOR_ID)) return;
        if (getPropBehaviorId(prop) !== HPA_GROUND_NAV_BEHAVIOR_ID) return;
        hpaBehavior.setMoveTarget(prop, world);
        moved++;
    });
    return moved > 0;
}
