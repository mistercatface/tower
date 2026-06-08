/**
 * @typedef {Object} RoguelikeMapSession
 * @property {number | null} selectedNodeId
 * @property {{ x: number, y: number } | null} playerPos
 * @property {{ x: number, y: number } | null} targetPos
 * @property {Array<{ x: number, y: number }> | null} currentPath
 * @property {Array<{ x: number, y: number, id?: string }> | null} currentAbstractPath
 */
export function createRoguelikeMapSession() {
    return { selectedNodeId: null, playerPos: null, targetPos: null, currentPath: null, currentAbstractPath: null };
}
/** @param {object} state @returns {RoguelikeMapSession} */
export function getRoguelikeMapSession(state) {
    if (!state.roguelikeMapSession) state.roguelikeMapSession = createRoguelikeMapSession();
    return state.roguelikeMapSession;
}
