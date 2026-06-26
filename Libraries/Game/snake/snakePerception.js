import { createObserverVisionFrame, getObserverVisionFrame } from "../../Navigation/perception/observerVisionFrame.js";
function refreshObserverVisionFrame(state) {
    const snakeGame = state.sandbox.snakeGame;
    state.nav.observerVisionFrame = createObserverVisionFrame({
        tickId: snakeGame.simTick,
        navTopology: state.nav.topology,
        visionRange: snakeGame.config.shared.visionRange,
        viewport: state.viewport,
    });
}
export function requireSnakeVisionFrame(state) {
    ensureSnakePerceptionTick(state);
    return getObserverVisionFrame(state);
}
export function beginSnakePerceptionTick(state, tickId) {
    const snakeGame = state.sandbox.snakeGame;
    snakeGame.simTick = tickId;
    if (snakeGame.lastVisionBeginTick === tickId) return;
    snakeGame.lastVisionBeginTick = tickId;
    refreshObserverVisionFrame(state);
}
export function nextSnakePerceptionTickId(state) {
    const snakeGame = state.sandbox.snakeGame;
    snakeGame.simTick += 1;
    return snakeGame.simTick;
}
export function beginSnakePerceptionFrame(state) {
    const tickId = nextSnakePerceptionTickId(state);
    beginSnakePerceptionTick(state, tickId);
    state.nav.session?.beginFrame(tickId);
    return tickId;
}
export function endSnakePerceptionFrame(state) {
    state.nav.session?.flushFrame();
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
