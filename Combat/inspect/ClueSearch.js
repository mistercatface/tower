import { fireRadioTrigger, requestUiHudUpdate, startRadioConversation } from "../../Core/EventSystem.js";
import { findInspectablePickup } from "./inspectTargeting.js";

/**
 * Post-Garbanzo-fight clue search (inspector tutorial at game start).
 *
 * 1. Intro guards dead → intro_guards_cleared radio → inspector mode
 * 2. Tap clue objects → guided inspect radios
 * 3. All clues found → clue_search_complete radio → horde unlocks
 */

export const CLUE_SEARCH_KEYS = ["jacko_can", "wood_crate"];

const GUIDED_INSPECT_CONVERSATIONS = {
    jacko_can: "inspect_jacko_can_garbanzo",
    wood_crate: "inspect_wood_crate_barry_brock",
};

const GUIDED_INSPECT_CONVERSATION_IDS = Object.values(GUIDED_INSPECT_CONVERSATIONS);

export function shouldRunClueSearch(state) {
    return !state.clueSearchCompleted;
}

export function getClueSearchMissionLabel(state) {
    const found = state.clueSearchSeen?.size ?? 0;
    const total = CLUE_SEARCH_KEYS.length;
    return `Tap nearby objects to search for clues (${found}/${total})`;
}

function hasLivingIntroGuards(state) {
    return state.enemies.some((enemy) => enemy.isIntroGuard && !enemy.isDead);
}

function isClueSearchInProgress(state) {
    return state.clueSearchActive || state.clueSearchFinishing;
}

/**
 * Last intro guard killed → aftermath radio, then clue search in inspector mode.
 * @returns {boolean} true when the sequence was started
 */
export function tryBeginClueSearchAfterIntroGuards(state, fsm) {
    if (state.clueSearchCompleted || isClueSearchInProgress(state)) return false;
    if (fsm?.currentStateName === "inspector") return false;
    if (!state.startNodeIntroCompleted) return false;
    if (hasLivingIntroGuards(state)) return false;

    fireRadioTrigger(
        "intro_guards_cleared",
        () => {
            beginClueSearch(state, () => {
                state.skipCombatEnterReset = true;
                fsm?.transition("combat");
            });
            fsm?.transition("inspector");
        },
        state,
    );
    return true;
}

export function beginClueSearch(state, onComplete) {
    state.clueSearchActive = true;
    state.clueSearchSeen = new Set();
    state.clueSearchOnComplete = onComplete ?? null;
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

export function findClueSearchPickup(state, worldX, worldY) {
    if (!state.clueSearchActive) return null;
    return findInspectablePickup(state, worldX, worldY, {
        allowedInspectKeys: CLUE_SEARCH_KEYS,
    });
}

function hasFoundAllClues(state) {
    return CLUE_SEARCH_KEYS.every((key) => state.clueSearchSeen.has(key));
}

function tryFinishClueSearch(state) {
    if (!state.clueSearchSeen || state.clueSearchCompleted) return;
    if (!hasFoundAllClues(state)) return;
    if (state.inspectPanelOpen) return;
    finishClueSearch(state);
}

export function recordClueFound(state, inspectKey) {
    if (!state.clueSearchSeen || state.clueSearchCompleted || !inspectKey) return;
    if (!CLUE_SEARCH_KEYS.includes(inspectKey)) return;

    state.clueSearchSeen.add(inspectKey);
    requestUiHudUpdate();
    tryFinishClueSearch(state);
}

export function onInspectPanelClosed(state) {
    if (!state?.clueSearchSeen) return;
    state.inspectPanelOpen = false;
    tryFinishClueSearch(state);
}

function finishClueSearch(state) {
    if (state.clueSearchFinishing) return;
    state.clueSearchFinishing = true;
    state.clueSearchActive = false;
    requestUiHudUpdate();

    fireRadioTrigger(
        "clue_search_complete",
        () => {
            state.clueSearchCompleted = true;
            state.clueSearchFinishing = false;
            const onComplete = state.clueSearchOnComplete;
            state.clueSearchOnComplete = null;
            if (onComplete) onComplete();
        },
        state,
    );
}
