import { fireRadioTrigger, requestUiHudUpdate, startRadioConversation } from "../../Core/EventSystem.js";
import { findInspectablePickup } from "./inspectTargeting.js";

/** Inspect keys required on start node after the Garbanzo intro fight. */
export const START_NODE_INSPECTION_KEYS = ["jacko_can", "wood_crate"];

const GUIDED_INSPECT_CONVERSATIONS = {
    jacko_can: "inspect_jacko_can_garbanzo",
    wood_crate: "inspect_wood_crate_barry_brock",
};

const GUIDED_INSPECT_CONVERSATION_IDS = Object.values(GUIDED_INSPECT_CONVERSATIONS);

export function shouldEnterStartNodeInspection(state) {
    return !state.startNodeInspectionCompleted;
}

export function getStartNodeInspectionMissionLabel(state) {
    const found = state.startNodeInspectionSeen?.size ?? 0;
    const total = START_NODE_INSPECTION_KEYS.length;
    return `Tap nearby objects to search for clues (${found}/${total})`;
}

function hasLivingIntroGuards(state) {
    return state.enemies.some((enemy) => enemy.isIntroGuard && !enemy.isDead);
}

/**
 * After the start-node guard dialog fight, play first-wave radio and enter inspector.
 * @returns {boolean} true when the inspection sequence was started
 */
export function tryEnterStartNodeInspectionAfterGarbanzoFight(state, fsm) {
    if (state.startNodeInspectionCompleted || state.startNodeInspectionActive || state.startNodeInspectionPending || state.startNodeInspectionFinishing) {
        return false;
    }
    if (fsm?.currentStateName === "inspector") return false;

    if (!state.startNodeIntroCompleted) return false;
    if (hasLivingIntroGuards(state)) return false;

    fireRadioTrigger(
        "first_wave_clear",
        () => {
            beginStartNodeInspection(state, () => {
                state.skipCombatEnterReset = true;
                fsm?.transition("combat");
            });
            fsm?.transition("inspector");
        },
        state,
    );
    return true;
}

export function beginStartNodeInspection(state, onComplete) {
    state.startNodeInspectionActive = true;
    state.startNodeInspectionSeen = new Set();
    state.startNodeInspectionPending = onComplete ?? null;
    state.inspectPanelOpen = false;

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
    if (state.inspectPanelOpen) return;
    finishStartNodeInspection(state);
}

export function recordStartNodeInspection(state, inspectKey) {
    if (!state.startNodeInspectionSeen || state.startNodeInspectionCompleted || !inspectKey) return;
    if (!START_NODE_INSPECTION_KEYS.includes(inspectKey)) return;

    state.startNodeInspectionSeen.add(inspectKey);
    requestUiHudUpdate();
    tryCompleteStartNodeInspection(state);
}

export function onInspectPanelClosed(state) {
    if (!state?.startNodeInspectionSeen) return;
    state.inspectPanelOpen = false;
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
