import { beginGridVisionTick } from "../../Navigation/perception/gridCellVisionSession.js";
export function beginSnakePerceptionTick(state, tickId) {
    const snakeGame = state.sandbox.snakeGame;
    snakeGame.simTick = tickId;
    if (snakeGame.lastVisionBeginTick === tickId) return;
    snakeGame.lastVisionBeginTick = tickId;
    beginGridVisionTick(state, tickId);
}
export function nextSnakePerceptionTickId(state) {
    const snakeGame = state.sandbox.snakeGame;
    snakeGame.simTick += 1;
    return snakeGame.simTick;
}
export function beginSnakePerceptionFrame(state) {
    const tickId = nextSnakePerceptionTickId(state);
    beginSnakePerceptionTick(state, tickId);
    return tickId;
}
export function ensureSnakePerceptionTick(state) {
    const snakeGame = state.sandbox.snakeGame;
    if (snakeGame.simTick <= 0) beginSnakePerceptionFrame(state);
    else beginSnakePerceptionTick(state, snakeGame.simTick);
}
export function maybeBeginSnakeAutosimTick(state) {
    const snakeGame = state.sandbox.snakeGame;
    if (snakeGame._batchingPerception) return;
    beginSnakePerceptionFrame(state);
}
