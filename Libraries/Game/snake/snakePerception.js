import { createGridCellVisionSession, beginGridCellVisionTick } from "../../Navigation/perception/gridCellVisionSession.js";
/** @param {object} state @param {number} tickId */
export function beginSnakePerceptionTick(state, tickId) {
    const snakeGame = state.sandbox?.snakeGame;
    const nav = state.navigation;
    if (!nav) return;
    if (!nav.gridCellVisionSession) nav.gridCellVisionSession = createGridCellVisionSession();
    if (snakeGame) {
        if (snakeGame.lastVisionBeginTick === tickId) return;
        snakeGame.lastVisionBeginTick = tickId;
    } else if (nav._perceptionTickFrame === tickId) return;
    else nav._perceptionTickFrame = tickId;
    const wallRevision = nav.gridNavContext?.wallRevision ?? state.obstacleGrid?.wallGridRevision ?? 0;
    beginGridCellVisionTick(nav.gridCellVisionSession, wallRevision);
}
/** @param {object} state */
export function nextSnakePerceptionTickId(state) {
    const snakeGame = state.sandbox?.snakeGame;
    if (!snakeGame) return (state.navigation._perceptionTick = (state.navigation._perceptionTick ?? 0) + 1);
    snakeGame.simTick = (snakeGame.simTick ?? 0) + 1;
    return snakeGame.simTick;
}
/** @param {object} state */
export function beginSnakePerceptionFrame(state) {
    const tickId = nextSnakePerceptionTickId(state);
    beginSnakePerceptionTick(state, tickId);
    return tickId;
}
/** @param {object} state */
export function ensureSnakePerceptionTick(state) {
    const snakeGame = state.sandbox?.snakeGame;
    const tickId = snakeGame?.simTick ?? state.navigation._perceptionTick ?? 0;
    if (tickId <= 0) beginSnakePerceptionFrame(state);
    else beginSnakePerceptionTick(state, tickId);
}
/** @param {object} state */
export function maybeBeginSnakeAutosimTick(state) {
    const snakeGame = state.sandbox?.snakeGame;
    if (snakeGame?._batchingPerception) return;
    beginSnakePerceptionFrame(state);
}
