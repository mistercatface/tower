import { createHornSatelliteInstance } from "../hornSatellite/HornSatelliteInstance.js";
import { registerAliveAgent, markAgentDead, purgeInertAgentsForHead } from "../../../AI/agents/agentPopulationRegistry.js";
import { clearChainLinksForMembers } from "../../../Sandbox/chainLinks.js";
import { shatterSnakeSegments } from "../snakeSegmentFracture.js";
import { clearSnakeSteeringLeaseFromProp } from "../snakeSteeringLease.js";
export const hornSatelliteSpecies = {
    id: "horn_satellite",
    createInstance(state, ctx) {
        return createHornSatelliteInstance(state, ctx);
    },
    register(session, instance) {
        registerAliveAgent(session.registry, instance.headId, this.id, instance);
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
        const members = instance.syncMembers(state);
        clearChainLinksForMembers(state, members);
        shatterSnakeSegments(state, deathImpact?.spatialFrame ?? null, members, deathImpact);
        purgeInertAgentsForHead(session.registry, instance.headId);
        markAgentDead(session.registry, instance.headId);
        session.instancesByHeadId.delete(instance.headId);
        const head = state.entityRegistry.get(instance.headId);
        if (head) clearSnakeSteeringLeaseFromProp(head);
    },
    validate(instance, state, session) {
        instance.validate(state, session);
    },
    tick(instance, state, dtMs) {
        instance.tick(state, dtMs);
    },
    syncMembers(instance, state) {
        return instance.syncMembers(state);
    },
    syncAfterPhysics(instance, state) {
        instance.syncAfterPhysics(state);
    },
    resolveRelationship(targetSpecies) {
        if (targetSpecies === "snake") return "threat";
        if (targetSpecies === "flee_agent" || targetSpecies === "horn_satellite") return "neutral";
        return "neutral";
    },
};
