import { getSnakeSizeScore } from "./snakeScale.js";
import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { ensureSnakePerceptionTick, maybeBeginSnakeAutosimTick, endSnakePerceptionFrame } from "./snakePerception.js";
import { clearChainLinksForMembers } from "../../Sandbox/chainLinks.js";
import { shatterSnakeSegments } from "./snakeSegmentFracture.js";
import { clearSnakeSteeringLeaseFromProp } from "./snakeSteeringLease.js";
import { markAgentDead, purgeInertAgentsForHead } from "../../AI/agents/agentPopulationRegistry.js";
export function getAgentRelationship(seekerId, targetId, state, registry) {
    const seekerMeta = registry.aliveByHeadId.get(seekerId);
    const targetMeta = registry.aliveByHeadId.get(targetId);
    if (!seekerMeta || !targetMeta) return "neutral";
    const seekerSpecies = seekerMeta.species;
    const targetSpecies = targetMeta.species;
    if (seekerSpecies === "snake") {
        if (targetSpecies === "snake") {
            const seekerScore = getSnakeSizeScore(state, seekerId);
            const targetScore = getSnakeSizeScore(state, targetId);
            if (targetScore > seekerScore) return "threat";
            if (targetScore < seekerScore) return "prey";
            return "neutral";
        }
        if (targetSpecies === "flee_agent") return "prey";
    } else if (seekerSpecies === "flee_agent") if (targetSpecies === "snake") return "threat";
    return "neutral";
}
export function buildAgentMemberToInstanceMap(state, snakeGame) {
    const map = new Map();
    for (const instance of snakeGame.instancesByHeadId.values()) {
        if (instance.lifecycle !== "alive") continue;
        const members = typeof instance.syncMembersFromGraph === "function" ? instance.syncMembersFromGraph(state) : getConnectedComponentPath(state.kinetic, instance.headId);
        for (let i = 0; i < members.length; i++) map.set(members[i], instance);
    }
    return map;
}
export function resolveAgentInstanceForMember(state, snakeGame, memberId) {
    const instance = snakeGame.instancesByHeadId.get(memberId);
    if (instance && instance.lifecycle === "alive") return instance;
    return buildAgentMemberToInstanceMap(state, snakeGame).get(memberId) ?? null;
}
export function tickAgentBrainAndLocomotion(state, instance, dtMs, tickFsmLogic) {
    const snakeGame = state.sandbox.snakeGame;
    const soloTick = !snakeGame._batchingPerception;
    if (snakeGame._batchingPerception) ensureSnakePerceptionTick(state);
    else maybeBeginSnakeAutosimTick(state);
    const head = state.entityRegistry.getLive(instance.headId);
    if (head) {
        if (typeof instance.perceive === "function") instance.perceive(head, state);
        tickFsmLogic(head);
        if (instance.headNav) instance.headNav.tick(head, dtMs);
    }
    if (soloTick) endSnakePerceptionFrame(state);
}
export function reapAgentInstance(state, snakeGame, instance, deathImpact = null) {
    instance.lifecycle = "dead";
    if (typeof instance.stopSteering === "function") instance.stopSteering(state);
    snakeGame.autosimsByHeadId.delete(instance.headId);
    const connectedMembers = typeof instance.syncMembersFromGraph === "function" ? instance.syncMembersFromGraph(state) : getConnectedComponentPath(state.kinetic, instance.headId);
    const resolvedMembers = typeof instance.retireAllSegments === "function" ? instance.retireAllSegments(state, snakeGame, connectedMembers) : connectedMembers;
    clearChainLinksForMembers(state, resolvedMembers);
    shatterSnakeSegments(state, deathImpact?.spatialFrame ?? null, resolvedMembers, deathImpact);
    purgeInertAgentsForHead(snakeGame.registry, instance.headId);
    markAgentDead(snakeGame.registry, instance.headId);
    snakeGame.instancesByHeadId.delete(instance.headId);
    const head = state.entityRegistry.get(instance.headId);
    if (head) clearSnakeSteeringLeaseFromProp(head);
    if (snakeGame.onHeadDied) snakeGame.onHeadDied(instance.headId);
}
