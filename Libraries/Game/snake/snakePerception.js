import { beginGridVisionTick } from "../../Navigation/perception/gridCellVisionSession.js";
import { ensureObserverGridVision, resolveObserverViewSyncContext } from "../../Navigation/perception/gridCellVision.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
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
export function ensureSnakeObserverVision(state, observer, visionCone = getSnakeGameConfig().visionCone) {
    ensureSnakePerceptionTick(state);
    const config = getSnakeGameConfig();
    const viewSync = resolveObserverViewSyncContext(state.viewport, observer, config.brainSyncOffScreenInterval);
    return ensureObserverGridVision(observer, state.navigation.gridNavContext, visionCone, state.navigation.gridCellVisionSession, {
        ...viewSync,
        perceptionTick: state.sandbox.snakeGame.simTick,
        brainSyncTick: observer._brainSyncTick ?? 0,
    });
}
