import { beginGridVisionTick } from "../../Navigation/perception/gridCellVisionSession.js";
import { createObserverVisionFrame } from "../../Navigation/perception/observerVisionFrame.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
function refreshObserverVisionFrame(state) {
    const config = getSnakeGameConfig();
    state.navigation.observerVisionFrame = createObserverVisionFrame({
        tickId: state.sandbox.snakeGame.simTick,
        gridNavContext: state.navigation.gridNavContext,
        visionSession: state.navigation.gridCellVisionSession,
        visionCone: config.visionCone,
        viewport: state.viewport,
        brainSyncOffScreenInterval: config.brainSyncOffScreenInterval,
    });
}
export function beginSnakePerceptionTick(state, tickId) {
    const snakeGame = state.sandbox.snakeGame;
    snakeGame.simTick = tickId;
    if (snakeGame.lastVisionBeginTick === tickId) return;
    snakeGame.lastVisionBeginTick = tickId;
    beginGridVisionTick(state, tickId);
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
export function ensureSnakeObserverVision(state, observer, visionCone = getSnakeGameConfig().visionCone) {
    ensureSnakePerceptionTick(state);
    return state.navigation.observerVisionFrame.ensureHeadVision(observer, visionCone);
}
