import { getOrderedChainMemberIds, removeChainLinkBetween, clearChainLinksForProp } from "../../Sandbox/chainLinks.js";
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
export function shrinkSnakeChainFromStarvation(state, headId) {
    const config = getSnakeGameConfig();
    const minSegments = config.minAliveSegmentCount;
    const members = getOrderedChainMemberIds(state, headId);
    if (members.length <= minSegments) return false;
    const tailId = members[members.length - 1];
    const prevId = members[members.length - 2];
    const tail = state.entityRegistry.getLive(tailId);
    removeChainLinkBetween(state, prevId, tailId);
    clearChainLinksForProp(state, tailId);
    removeSandboxWorldProp(state, tail);
    stepSnakeChainRadiusDown(state, headId);
    return true;
}
export function tickSnakeFoodTimer(state, headId, timer, dt) {
    const config = getSnakeGameConfig();
    if (getSnakeSegmentCount(state, headId) <= config.minAliveSegmentCount) {
        timer.remainingSec = timer.intervalSec;
        return false;
    }
    timer.remainingSec -= dt;
    let shed = false;
    while (timer.remainingSec <= 0 && getSnakeSegmentCount(state, headId) > config.minAliveSegmentCount) {
        if (!shrinkSnakeChainFromStarvation(state, headId)) {
            timer.remainingSec = timer.intervalSec;
            break;
        }
        shed = true;
        timer.remainingSec += timer.intervalSec;
    }
    if (getSnakeSegmentCount(state, headId) <= config.minAliveSegmentCount) timer.remainingSec = timer.intervalSec;
    return shed;
}
