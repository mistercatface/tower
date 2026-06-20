import { getPropAsset } from "../../../Props/PropCatalog.js";
import { sandboxAssetMatchesTagFilter } from "../../sandboxCapabilities.js";
import { isChainSteeringTarget } from "../../chainLinks.js";
import { HPA_GROUND_NAV_BEHAVIOR_ID } from "../groundNavIds.js";
export function isSandboxNavPropAsset(asset) {
    return sandboxAssetMatchesTagFilter(asset, "nav");
}
export function countNavPropsInSelection(state, propIds, entityMeta = null) {
    let count = 0;
    for (let i = 0; i < propIds.length; i++) {
        const prop = state.entityRegistry.getLive(propIds[i]);
        if (!prop || prop.isDead) continue;
        if (!isSandboxNavPropAsset(getPropAsset(prop.type))) continue;
        if (entityMeta && !isChainSteeringTarget(state, entityMeta, prop.id)) continue;
        count++;
    }
    return count;
}
export function issueGroundNavToSelection(state, { propIds, behaviorId, world, behaviorById, entityMeta }) {
    const behavior = behaviorById.get(behaviorId);
    if (behaviorId === HPA_GROUND_NAV_BEHAVIOR_ID)
        console.log("issueGroundNavToSelection (hpa) called:", { propIds, behaviorId, world, hasBehavior: !!behavior, hasSetMoveTarget: !!behavior?.setMoveTarget });
    if (!behavior?.setMoveTarget) return 0;
    let moved = 0;
    for (let i = 0; i < propIds.length; i++) {
        const prop = state.entityRegistry.getLive(propIds[i]);
        if (!prop) {
            if (behaviorId === HPA_GROUND_NAV_BEHAVIOR_ID) console.log(`prop ${propIds[i]} is missing`);
            continue;
        }
        if (prop.isDead) {
            if (behaviorId === HPA_GROUND_NAV_BEHAVIOR_ID) console.log(`prop ${prop.id} is dead`);
            continue;
        }
        const asset = getPropAsset(prop.type);
        const isNav = isSandboxNavPropAsset(asset);
        if (!isNav) {
            if (behaviorId === HPA_GROUND_NAV_BEHAVIOR_ID) console.log(`prop ${prop.id} is not a nav prop asset`, asset);
            continue;
        }
        const isSteeringTarget = isChainSteeringTarget(state, entityMeta, prop.id);
        if (!isSteeringTarget) {
            if (behaviorId === HPA_GROUND_NAV_BEHAVIOR_ID) console.log(`prop ${prop.id} is not a chain steering target`);
            continue;
        }
        if (behaviorId === HPA_GROUND_NAV_BEHAVIOR_ID) console.log(`setting active behavior and move target for prop ${prop.id}`, { x: prop.x, y: prop.y }, "to world", world);
        entityMeta.setActiveBehaviorId(prop.id, behaviorId);
        behavior.setMoveTarget(prop, world);
        moved++;
    }
    if (behaviorId === HPA_GROUND_NAV_BEHAVIOR_ID) console.log(`issueGroundNavToSelection (hpa) finished. Moved ${moved} props.`);
    return moved;
}
