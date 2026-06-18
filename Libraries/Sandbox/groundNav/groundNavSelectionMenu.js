import { getSandboxBehaviorLabel } from "../sandboxCapabilities.js";
import { FLOW_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "./groundNavIds.js";
export const GROUND_NAV_SELECTION_MOVE_IDS = [HPA_GROUND_NAV_BEHAVIOR_ID, FLOW_GROUND_NAV_BEHAVIOR_ID];
export function buildGroundNavSelectionMenuActions({ propIds, world, navCount, issueGroundNav }) {
    if (navCount === 0) return [];
    const actions = [];
    for (let i = 0; i < GROUND_NAV_SELECTION_MOVE_IDS.length; i++) {
        const behaviorId = GROUND_NAV_SELECTION_MOVE_IDS[i];
        actions.push({ label: `${getSandboxBehaviorLabel(behaviorId)} (${navCount})`, onClick: () => issueGroundNav({ propIds, behaviorId, world }) });
    }
    return actions;
}
