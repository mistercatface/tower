/**
 * @typedef {Object} RoguelikeMapSession
 * @property {number | null} selectedNodeId
 */
export function createRoguelikeMapSession() {
    return { selectedNodeId: null };
}
/** @param {object} state @returns {RoguelikeMapSession} */
export function getRoguelikeMapSession(state) {
    if (!state.roguelikeMapSession) state.roguelikeMapSession = createRoguelikeMapSession();
    return state.roguelikeMapSession;
}
