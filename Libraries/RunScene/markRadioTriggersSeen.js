/**
 * @param {object} state
 * @param {string[]} triggers
 * @param {{ getConversationIdsForTrigger: (trigger: string) => string[] }} registry
 */
export function markRadioTriggersSeen(state, triggers, registry) {
    if (!state.radioSeenThisRun) state.radioSeenThisRun = {};
    for (const trigger of triggers) {
        for (const conversationId of registry.getConversationIdsForTrigger(trigger)) {
            state.radioSeenThisRun[conversationId] = true;
        }
    }
}
