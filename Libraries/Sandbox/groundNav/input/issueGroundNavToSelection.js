import { getPropAsset } from "../../../Props/PropCatalog.js";
import { sandboxAssetMatchesTagFilter } from "../../sandboxCapabilities.js";
export function isSandboxNavPropAsset(asset) {
    return sandboxAssetMatchesTagFilter(asset, "nav");
}
export function countNavPropsInSelection(state, propIds) {
    let count = 0;
    for (let i = 0; i < propIds.length; i++) {
        const prop = state.entityRegistry.getLive(propIds[i]);
        if (!prop || prop.isDead) continue;
        if (!isSandboxNavPropAsset(getPropAsset(prop.type))) continue;
        count++;
    }
    return count;
}
export function issueGroundNavToSelection(state, { propIds, behaviorId, world, behaviorById, entityMeta }) {
    const behavior = behaviorById.get(behaviorId);
    if (!behavior?.setMoveTarget) return 0;
    let moved = 0;
    for (let i = 0; i < propIds.length; i++) {
        const prop = state.entityRegistry.getLive(propIds[i]);
        if (!prop || prop.isDead) continue;
        if (!isSandboxNavPropAsset(getPropAsset(prop.type))) continue;
        entityMeta.setActiveBehaviorId(prop.id, behaviorId);
        behavior.setMoveTarget(prop, world);
        moved++;
    }
    return moved;
}
