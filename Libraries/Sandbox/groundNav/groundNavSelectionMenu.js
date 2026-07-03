import { getSandboxBehaviorLabel, sandboxAssetMatchesTagFilter, FLOW_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../sandboxCapabilities.js";
import { isChainSteeringTarget } from "../chainLinks.js";
import propCatalog from "../../../Assets/props/index.js";
export const GROUND_NAV_SELECTION_MOVE_IDS = [HPA_GROUND_NAV_BEHAVIOR_ID, FLOW_GROUND_NAV_BEHAVIOR_ID];
export function isSandboxNavPropAsset(asset) {
    return sandboxAssetMatchesTagFilter(asset, "nav");
}
export function countNavPropsInSelection(state, propIds, entityMeta = null) {
    let count = 0;
    for (let i = 0; i < propIds.length; i++) {
        const prop = state.entityRegistry.getLive(propIds[i]);
        if (!prop || prop.isDead) continue;
        if (prop.alwaysExplore) continue;
        if (!isSandboxNavPropAsset(propCatalog[prop.type])) continue;
        if (entityMeta && !isChainSteeringTarget(state, entityMeta, prop.id)) continue;
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
        if (prop.alwaysExplore) continue;
        if (!isSandboxNavPropAsset(propCatalog[prop.type])) continue;
        if (!isChainSteeringTarget(state, entityMeta, prop.id)) continue;
        entityMeta.setActiveBehaviorId(prop.id, behaviorId);
        behavior.setMoveTarget(prop, world);
        moved++;
    }
    return moved;
}
export function buildGroundNavSelectionMenuActions({ propIds, world, navCount, issueGroundNav }) {
    if (navCount === 0) return [];
    const actions = [];
    for (let i = 0; i < GROUND_NAV_SELECTION_MOVE_IDS.length; i++) {
        const behaviorId = GROUND_NAV_SELECTION_MOVE_IDS[i];
        actions.push({ label: `${getSandboxBehaviorLabel(behaviorId)} (${navCount})`, onClick: () => issueGroundNav({ propIds, behaviorId, world }) });
    }
    return actions;
}
