import { fireRadioTrigger, requestUiHudUpdate, startRadioConversation } from "../Core/EventSystem.js";
import { findInspectablePickup } from "../Render/Inspector/InspectRegistry.js";

/** Inspect keys required on start node after wave 1 (barrel = energy drink, crate). */
export const START_NODE_INSPECTION_KEYS = ["jacko_can", "wood_crate"];

const GUIDED_INSPECT_CONVERSATIONS = {
    jacko_can: "inspect_jacko_can_garbanzo",
    wood_crate: "inspect_wood_crate_barry_brock",
};

const GUIDED_INSPECT_CONVERSATION_IDS = Object.values(GUIDED_INSPECT_CONVERSATIONS);

export function shouldEnterStartNodeInspection(state) {
    const node = state.getCurrentMapNode();
    return node?.id === 0 && !state.startNodeInspectionCompleted;
}

export function getStartNodeInspectionMissionLabel(state) {
    const found = state.startNodeInspectionSeen?.size ?? 0;
    const total = START_NODE_INSPECTION_KEYS.length;
    return `Tap nearby objects to search for clues (${found}/${total})`;
}

export function beginStartNodeInspection(state, onSectorComplete) {
    state.startNodeInspectionActive = true;
    state.startNodeInspectionSeen = new Set();
    state.startNodeInspectionPending = onSectorComplete ?? null;
    state.propInspectorPanelOpen = false;

    if (state.radioSeenThisRun) {
        for (const conversationId of GUIDED_INSPECT_CONVERSATION_IDS) {
            delete state.radioSeenThisRun[conversationId];
        }
    }

    requestUiHudUpdate();
}

export function playGuidedInspectRadio(state, inspectKey, onComplete) {
    const conversationId = GUIDED_INSPECT_CONVERSATIONS[inspectKey];
    if (!conversationId) {
        if (onComplete) onComplete();
        return;
    }
    startRadioConversation(conversationId, onComplete, state, { force: true });
}

export function findStartNodeInspectionPickup(state, worldX, worldY) {
    if (!state.startNodeInspectionActive) return null;
    return findInspectablePickup(state, worldX, worldY, {
        allowedInspectKeys: START_NODE_INSPECTION_KEYS,
    });
}

function hasSeenAllInspectionTargets(state) {
    return START_NODE_INSPECTION_KEYS.every((key) => state.startNodeInspectionSeen.has(key));
}

/** Run sector-complete radio only after the 3D inspect panel closes (if it was open). */
export function tryCompleteStartNodeInspection(state) {
    if (!state.startNodeInspectionSeen || state.startNodeInspectionCompleted) return;
    if (!hasSeenAllInspectionTargets(state)) return;
    if (state.propInspectorPanelOpen) return;
    finishStartNodeInspection(state);
}

export function recordStartNodeInspection(state, inspectKey) {
    if (!state.startNodeInspectionSeen || state.startNodeInspectionCompleted || !inspectKey) return;
    if (!START_NODE_INSPECTION_KEYS.includes(inspectKey)) return;

    state.startNodeInspectionSeen.add(inspectKey);
    requestUiHudUpdate();
    tryCompleteStartNodeInspection(state);
}

export function onPropInspectorPanelClosed(state) {
    if (!state?.startNodeInspectionSeen) return;
    state.propInspectorPanelOpen = false;
    tryCompleteStartNodeInspection(state);
}

function finishStartNodeInspection(state) {
    if (state.startNodeInspectionFinishing) return;
    state.startNodeInspectionFinishing = true;
    state.startNodeInspectionActive = false;
    requestUiHudUpdate();

    fireRadioTrigger(
        "start_node_inspection_complete",
        () => {
            state.startNodeInspectionCompleted = true;
            state.startNodeInspectionFinishing = false;
            const onComplete = state.startNodeInspectionPending;
            state.startNodeInspectionPending = null;
            if (onComplete) onComplete();
        },
        state,
    );
}
