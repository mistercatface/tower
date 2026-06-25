import { AGENT_PROFILE, getAgentProfile } from "../../AI/agents/agentProfile.js";
import { removeChainLinkBetween, clearChainLinksForProp } from "../../Sandbox/chainLinks.js";
import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { getSnakeGameConfig, resolveSnakeSegmentSpacing } from "./snakeGameConfig.js";
import { getCirclePropRadius } from "../../Props/propScale.js";
// --- Simple Agent Metabolism ---
export function createSimpleAgentMetabolism() {
    return { hunger: 1 };
}
export function getSimpleAgentHunger(metabolism) {
    return metabolism.hunger;
}
export function setSimpleAgentHunger(metabolism, fraction) {
    metabolism.hunger = Math.max(0, Math.min(1, fraction));
}
export function feedSimpleAgentMetabolism(metabolism, profileId, value = null) {
    const profile = getAgentProfile(profileId);
    const foodValue = value ?? profile.metabolism?.foodValue ?? 0.5;
    metabolism.hunger = Math.min(1, metabolism.hunger + foodValue);
}
export function tickSimpleAgentMetabolism(metabolism, profileId, dtMs, drainMultiplier = 1) {
    const { hungerDrainMs } = getAgentProfile(profileId).metabolism;
    metabolism.hunger -= (dtMs * drainMultiplier) / hungerDrainMs;
    if (metabolism.hunger < 0) metabolism.hunger = 0;
}
// --- Snake Scaling & Growth ---
export function getSnakeChainRadius(state, headId) {
    const head = state.entityRegistry.getLive(headId);
    return getCirclePropRadius(head);
}
export function getSnakeSegmentCount(state, headId, members = null) {
    const head = state.entityRegistry.getLive(headId);
    if (head && head._cachedSnakeSegmentCount !== undefined && head._cachedSnakeSegmentCountFrame === state.sandbox.frameId && !members) return head._cachedSnakeSegmentCount;
    const count = (members || getConnectedComponentPath(state.kinetic, headId)).length;
    if (head) {
        head._cachedSnakeSegmentCount = count;
        head._cachedSnakeSegmentCountFrame = state.sandbox?.frameId;
    }
    return count;
}
export function getSnakeSizeScore(state, headId, members = null) {
    const head = state.entityRegistry.getLive(headId);
    if (head && head._cachedSnakeSizeScore !== undefined && head._cachedSnakeSizeScoreFrame === state.sandbox?.frameId && !members) return head._cachedSnakeSizeScore;
    const score = getSnakeSegmentCount(state, headId, members) * 1000 + getSnakeChainRadius(state, headId);
    if (head) {
        head._cachedSnakeSizeScore = score;
        head._cachedSnakeSizeScoreFrame = state.sandbox?.frameId;
    }
    return score;
}
export function growSnakeChainAfterMeal(state, headId, members = null) {
    const config = getSnakeGameConfig();
    const segmentRadius = getSnakeChainRadius(state, headId);
    return { segmentRadius, spacing: resolveSnakeSegmentSpacing(config, segmentRadius), linkSlack: config.agentProfiles.snake.linkSlack };
}
// --- Snake Metabolism & Starvation ---
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
export function feedSnakeMetabolism(metabolism, value = getSnakeGameConfig().agentProfiles.snake.metabolism.foodValue) {
    const { foodValue, growthCost } = getSnakeGameConfig().agentProfiles.snake.metabolism;
    metabolism.starveMs = 0;
    metabolism.hunger += value ?? foodValue;
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
    const snake = getSnakeGameConfig().agentProfiles.snake;
    const minSegments = snake.minAliveSegmentCount;
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
export function tickSnakeMetabolism(state, headId, metabolism, dtMs, members = null, drainMultiplier = 1) {
    const snake = getSnakeGameConfig().agentProfiles.snake;
    const { hungerDrainMs, starveShedIntervalMs } = snake.metabolism;
    metabolism.hunger -= (dtMs * drainMultiplier) / hungerDrainMs;
    if (metabolism.hunger > 0) {
        metabolism.starveMs = 0;
        return false;
    }
    metabolism.hunger = 0;
    const resolvedMembers = members || getConnectedComponentPath(state.kinetic, headId);
    if (getSnakeSegmentCount(state, headId, resolvedMembers) <= snake.minAliveSegmentCount) {
        metabolism.starveMs = 0;
        return false;
    }
    metabolism.starveMs += dtMs * drainMultiplier;
    let shed = false;
    while (metabolism.starveMs >= starveShedIntervalMs && getSnakeSegmentCount(state, headId, resolvedMembers) > snake.minAliveSegmentCount) {
        if (!shrinkSnakeChainFromStarvation(state, headId, resolvedMembers)) break;
        resolvedMembers.pop();
        metabolism.starveMs -= starveShedIntervalMs;
        shed = true;
    }
    if (getSnakeSegmentCount(state, headId, resolvedMembers) <= snake.minAliveSegmentCount) metabolism.starveMs = 0;
    return shed;
}
