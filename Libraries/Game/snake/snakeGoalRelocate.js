/** @param {object} state @param {object} goal @param {number | null} skipHeadId */
export function notifySnakeGoalRelocated(state, goal, skipHeadId = null) {
    const snakeGame = state.sandbox?.snakeGame;
    const autosimsByHeadId = snakeGame?.autosimsByHeadId;
    const registry = snakeGame?.registry;
    if (!autosimsByHeadId || !registry) return;
    for (const [headId, autosim] of autosimsByHeadId) {
        if (headId === skipHeadId || !registry.aliveByHeadId.has(headId)) continue;
        autosim.onGoalRelocated?.(goal);
    }
}
