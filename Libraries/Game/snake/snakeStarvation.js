import { removeChainLinkBetween, clearChainLinksForProp } from "../../Sandbox/chainLinks.js";
import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { getSnakeSegmentCount, stepSnakeChainRadiusDown } from "./snakeScale.js";
export function createSnakeFoodTimer(intervalSec = getSnakeGameConfig().starvationIntervalSec) {
    return { remainingSec: intervalSec, intervalSec };
}
export function resetSnakeFoodTimer(timer, intervalSec = timer.intervalSec) {
    timer.remainingSec = intervalSec;
    timer.intervalSec = intervalSec;
}
export function getSnakeFoodTimerFraction(timer) {
    if (timer.intervalSec <= 0) return 1;
    return Math.max(0, Math.min(1, timer.remainingSec / timer.intervalSec));
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
    stepSnakeChainRadiusDown(state, headId, resolvedMembers.slice(0, -1));
    return true;
}
export function tickSnakeFoodTimer(state, headId, timer, dt, members = null) {
    const config = getSnakeGameConfig();
    const resolvedMembers = members || getConnectedComponentPath(state.kinetic, headId);
    if (getSnakeSegmentCount(state, headId, resolvedMembers) <= config.minAliveSegmentCount) {
        timer.remainingSec = timer.intervalSec;
        return false;
    }
    timer.remainingSec -= dt;
    let shed = false;
    while (timer.remainingSec <= 0 && getSnakeSegmentCount(state, headId, resolvedMembers) > config.minAliveSegmentCount) {
        if (!shrinkSnakeChainFromStarvation(state, headId, resolvedMembers)) {
            timer.remainingSec = timer.intervalSec;
            break;
        }
        resolvedMembers.pop();
        shed = true;
        timer.remainingSec += timer.intervalSec;
    }
    if (getSnakeSegmentCount(state, headId, resolvedMembers) <= config.minAliveSegmentCount) timer.remainingSec = timer.intervalSec;
    return shed;
}
