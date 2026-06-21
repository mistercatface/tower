/** @param {object} state @param {object} goal @param {number | null} skipHeadId */
export function notifySnakeGoalRelocated(state, goal, skipHeadId = null) {
    const autosimsByHeadId = state.sandbox?.snakeGame?.autosimsByHeadId;
    if (!autosimsByHeadId) return;
    for (const [headId, autosim] of autosimsByHeadId) {
        if (headId === skipHeadId) continue;
        autosim.onGoalRelocated?.(goal);
    }
}
