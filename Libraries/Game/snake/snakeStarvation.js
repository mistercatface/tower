import { removeChainLinkBetween, clearChainLinksForProp } from "../../Sandbox/chainLinks.js";
import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { getSnakeSegmentCount } from "./snakeScale.js";
/**
 * Snake metabolism — two independent meters:
 * - hunger: bounded satiety (1 = just ate, 0 = starving). The only thing the HUD/tint/AI read.
 *   Drains with time (faster while sprinting), refilled by eating. Same range for every snake,
 *   so length never makes a snake stop feeling hungry.
 * - growth: overflow reserve. Food past a full hunger bar spills here and builds new segments.
 * starveMs accumulates only while hunger is pinned at empty; it drives the shed cadence and is
 * never reset by shedding, so a starving snake keeps shrinking instead of bouncing to satisfied.
 */
export function createSnakeMetabolism() {
    return { hunger: 1, growth: 0, starveMs: 0 };
}
export function getSnakeHunger(metabolism) {
    return metabolism.hunger;
}
export function setSnakeHunger(metabolism, fraction) {
    metabolism.hunger = Math.max(0, Math.min(1, fraction));
    metabolism.starveMs = 0;
}
/** Eat one food: refill hunger first, spill the overflow into growth. Returns segments to grow. */
export function feedSnakeMetabolism(metabolism) {
    const { foodValue, growthCost } = getSnakeGameConfig().metabolism;
    metabolism.starveMs = 0;
    metabolism.hunger += foodValue;
    if (metabolism.hunger <= 1) return 0;
    metabolism.growth += metabolism.hunger - 1;
    metabolism.hunger = 1;
    let grow = 0;
    while (metabolism.growth >= growthCost) {
        metabolism.growth -= growthCost;
        grow++;
    }
    return grow;
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
/**
 * Drains the hunger bar; once it bottoms out the snake burns body segments on a steady cadence.
 * Shedding never touches the hunger bar, so the snake stays desperate until it actually eats.
 * @param {number} dtMs
 */
export function tickSnakeMetabolism(state, headId, metabolism, dtMs, members = null, drainMultiplier = 1) {
    const config = getSnakeGameConfig();
    const { hungerDrainMs, starveShedIntervalMs } = config.metabolism;
    metabolism.hunger -= (dtMs * drainMultiplier) / hungerDrainMs;
    if (metabolism.hunger > 0) {
        metabolism.starveMs = 0;
        return false;
    }
    metabolism.hunger = 0;
    const resolvedMembers = members || getConnectedComponentPath(state.kinetic, headId);
    if (getSnakeSegmentCount(state, headId, resolvedMembers) <= config.minAliveSegmentCount) {
        metabolism.starveMs = 0;
        return false;
    }
    metabolism.starveMs += dtMs * drainMultiplier;
    let shed = false;
    while (metabolism.starveMs >= starveShedIntervalMs && getSnakeSegmentCount(state, headId, resolvedMembers) > config.minAliveSegmentCount) {
        if (!shrinkSnakeChainFromStarvation(state, headId, resolvedMembers)) break;
        resolvedMembers.pop();
        metabolism.starveMs -= starveShedIntervalMs;
        shed = true;
    }
    if (getSnakeSegmentCount(state, headId, resolvedMembers) <= config.minAliveSegmentCount) metabolism.starveMs = 0;
    return shed;
}
