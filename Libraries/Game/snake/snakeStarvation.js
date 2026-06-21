import { removeChainLinkBetween, clearChainLinksForProp } from "../../Sandbox/chainLinks.js";
import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { getSnakeSegmentCount } from "./snakeScale.js";
export function createSnakeFoodTimer(intervalMs = getSnakeGameConfig().starvationIntervalMs) {
    return { remainingMs: intervalMs, intervalMs };
}
export function resetSnakeFoodTimer(timer, intervalMs = timer.intervalMs) {
    timer.remainingMs = intervalMs;
    timer.intervalMs = intervalMs;
}
export function getSnakeFoodTimerFraction(timer) {
    if (timer.intervalMs <= 0) return 1;
    return Math.max(0, Math.min(1, timer.remainingMs / timer.intervalMs));
}
export function setSnakeFoodTimerFraction(timer, fraction) {
    timer.remainingMs = Math.max(0, Math.min(1, fraction)) * timer.intervalMs;
}
export function shrinkSnakeChainFromStarvation(state, headId, members = null) {
    const config = getSnakeGameConfig();
    const minSegments = config.minAliveSegmentCount;
    const resolvedMembers = members || getConnectedComponentPath(state.kinetic, headId);
    if (resolvedMembers.length <= minSegments) return false;
    const tailId = resolvedMembers[resolvedMembers.length - 1];
    const prevId = resolvedMembers[resolvedMembers.length - 2];
    const tail = state.entityRegistry.getLive(tailId);
    removeChainLinkBetween(state, prevId, tailId);
    clearChainLinksForProp(state, tailId);
    removeSandboxWorldProp(state, tail);
    return true;
}
/** @param {number} dtMs */
export function tickSnakeFoodTimer(state, headId, timer, dtMs, members = null) {
    const config = getSnakeGameConfig();
    const resolvedMembers = members || getConnectedComponentPath(state.kinetic, headId);
    if (getSnakeSegmentCount(state, headId, resolvedMembers) <= config.minAliveSegmentCount) {
        timer.remainingMs = timer.intervalMs;
        return false;
    }
    timer.remainingMs -= dtMs;
    let shed = false;
    while (timer.remainingMs <= 0 && getSnakeSegmentCount(state, headId, resolvedMembers) > config.minAliveSegmentCount) {
        if (!shrinkSnakeChainFromStarvation(state, headId, resolvedMembers)) {
            timer.remainingMs = timer.intervalMs;
            break;
        }
        resolvedMembers.pop();
        shed = true;
        timer.remainingMs += timer.intervalMs;
    }
    if (getSnakeSegmentCount(state, headId, resolvedMembers) <= config.minAliveSegmentCount) timer.remainingMs = timer.intervalMs;
    return shed;
}
