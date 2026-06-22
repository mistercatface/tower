import { getSnakeSizeScore } from "../snakeScale.js";
import { createAliveSnakeInstance } from "../SnakeInstance.js";
import { registerAliveAgent, markAgentDead, purgeInertAgentsForHead } from "../../../AI/agents/agentPopulationRegistry.js";
import { clearChainLinksForMembers } from "../../../Sandbox/chainLinks.js";
import { shatterSnakeSegments } from "../snakeSegmentFracture.js";
import { clearSnakeSteeringLeaseFromProp } from "../snakeSteeringLease.js";
export const snakeSpecies = {
    id: "snake",
    createInstance(state, ctx) {
        return createAliveSnakeInstance(state, ctx);
    },
    register(session, instance) {
        registerAliveAgent(session.registry, instance.headId, this.id, instance);
        session.instancesByHeadId.set(instance.headId, instance);
        if (instance.autosim) session.autosimsByHeadId.set(instance.headId, instance.autosim);
    },
    start(instance, state) {
        instance.start(state);
    },
    stop(instance, state) {
        instance.stopSteering(state);
    },
    die(instance, state, session, deathImpact = null) {
        instance.lifecycle = "dead";
        instance.stopSteering(state);
        session.autosimsByHeadId.delete(instance.headId);
        const connectedMembers = instance.syncMembersFromGraph(state);
        const resolvedMembers = instance.retireAllSegments(state, session, connectedMembers);
        clearChainLinksForMembers(state, resolvedMembers);
        shatterSnakeSegments(state, deathImpact?.spatialFrame ?? null, resolvedMembers, deathImpact);
        purgeInertAgentsForHead(session.registry, instance.headId);
        markAgentDead(session.registry, instance.headId);
        session.instancesByHeadId.delete(instance.headId);
        const head = state.entityRegistry.get(instance.headId);
        if (head) clearSnakeSteeringLeaseFromProp(head);
        if (session.onHeadDied) session.onHeadDied(instance.headId);
    },
    validate(instance, state, session) {
        instance.validate(state, session);
    },
    tick(instance, state, dtMs) {
        instance.tick(state, dtMs);
    },
    updateDiagnostics(instance, state) {
        instance.updatePressureDiagnostics(state);
    },
    resolveRelationship(targetSpecies, seekerId, targetId, state) {
        if (targetSpecies === "snake") {
            const seekerHead = state.entityRegistry.getLive(seekerId);
            const targetHead = state.entityRegistry.getLive(targetId);
            const seekerFaction = seekerHead?.faction ?? null;
            const targetFaction = targetHead?.faction ?? null;
            if (!seekerFaction || !targetFaction) return "neutral";
            if (seekerFaction === targetFaction) return "ally";
            const seekerScore = getSnakeSizeScore(state, seekerId);
            const targetScore = getSnakeSizeScore(state, targetId);
            if (targetScore > seekerScore) return "threat";
            if (targetScore < seekerScore) return "prey";
            return "neutral";
        }
        if (targetSpecies === "flee_agent") return "prey";
        return "neutral";
    },
};
