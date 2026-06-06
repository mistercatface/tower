import { towerRadioRegistry } from "./wireRadio.js";

/**
 * Mark scripted radios as already seen so fireRadioTrigger / startRadioConversation skip them.
 * @param {object} state
 * @param {string[]} triggers
 */
export function markRadioTriggersSeen(state, triggers) {
    if (!state.radioSeenThisRun) state.radioSeenThisRun = {};
    for (const trigger of triggers) {
        for (const conversationId of towerRadioRegistry.getConversationIdsForTrigger(trigger)) {
            state.radioSeenThisRun[conversationId] = true;
        }
    }
}

/** @type {Record<string, string[]>} */
const SCENE_SKIP_RADIOS = {
    intro_guards: ["start_game_guards", "intro_guards_cleared"],
    clue_search: ["inspect:jacko_can", "inspect:wood_crate", "clue_search_complete"],
};

/**
 * Mark radios for scenes skipped by startAt, plus run_start when jumping past the opening yard.
 * @param {object} state
 * @param {string | null | undefined} startSceneId
 * @param {string[]} sceneIds — ordered scene ids from the run config
 */
export function markRadiosForSkippedScenes(state, startSceneId, sceneIds) {
    const targetIndex = startSceneId
        ? sceneIds.indexOf(startSceneId)
        : 0;
    if (targetIndex <= 0) return;

    markRadioTriggersSeen(state, ["run_start"]);

    for (let i = 0; i < targetIndex; i++) {
        const sceneId = sceneIds[i];
        const triggers = SCENE_SKIP_RADIOS[sceneId];
        if (triggers) markRadioTriggersSeen(state, triggers);
    }
}

export function markSceneSkipRadios(state, sceneId) {
    const triggers = SCENE_SKIP_RADIOS[sceneId];
    if (triggers) markRadioTriggersSeen(state, triggers);
}
