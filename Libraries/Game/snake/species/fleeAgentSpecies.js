import { createFleeAgentInstance } from "../fleeAgent/FleeAgentInstance.js";
import { registerAliveAgent, markAgentDead, purgeInertAgentsForHead } from "../../../AI/agents/agentPopulationRegistry.js";
import { clearChainLinksForMembers } from "../../../Sandbox/chainLinks.js";
import { shatterSnakeSegments } from "../snakeSegmentFracture.js";
import { clearSnakeSteeringLeaseFromProp } from "../snakeSteeringLease.js";
export const fleeAgentSpecies = {
    id: "flee_agent",
    createInstance(state, ctx) {
        return createFleeAgentInstance(state, ctx);
    },
    register(session, instance) {
        registerAliveAgent(session.registry, instance.headId, this.id, instance);
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
        clearChainLinksForMembers(state, connectedMembers);
        shatterSnakeSegments(state, deathImpact?.spatialFrame ?? null, connectedMembers, deathImpact);
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
    syncMembers(instance, state) {
        return instance.syncMembersFromGraph(state);
    },
    resolveRelationship(targetSpecies, seekerId, targetId, state) {
        if (targetSpecies === "snake") return "threat";
        if (targetSpecies === "squid") return "threat";
        if (targetSpecies === "flee_agent") {
            const seekerHead = state.entityRegistry.getLive(seekerId);
            const targetHead = state.entityRegistry.getLive(targetId);
            const seekerFaction = seekerHead?.faction ?? null;
            const targetFaction = targetHead?.faction ?? null;
            if (seekerFaction && targetFaction && seekerFaction === targetFaction) return "ally";
            if (seekerFaction && targetFaction && seekerFaction !== targetFaction) return "prey";
        }
        return "neutral";
    },
};
