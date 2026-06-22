import { createFleeAgentInstance } from "../fleeAgent/FleeAgentInstance.js";
import { registerAliveAgent } from "../../../AI/agents/agentPopulationRegistry.js";
export const fleeAgentSpecies = {
    id: "flee_agent",
    createInstance(state, ctx) {
        return createFleeAgentInstance(state, ctx);
    },
    register(session, instance) {
        registerAliveAgent(session.registry, instance.headId, this.id, instance);
        session.instancesByHeadId.set(instance.headId, instance);
    },
    start(instance, state) {
        instance.start(state);
    },
    stop(instance, state) {
        instance.stopSteering(state);
    },
    validate(instance, state, session) {
        if (typeof instance.validate === "function") instance.validate(state, session);
    },
    tick(instance, state, dtMs) {
        if (typeof instance.tick === "function") instance.tick(state, dtMs);
    },
    syncMembers(instance, state) {
        if (typeof instance.syncMembersFromGraph === "function") instance.syncMembersFromGraph(state);
    },
    syncPresentation(instance, state) {
        if (typeof instance.syncWedgeFacing === "function") instance.syncWedgeFacing(state);
    },
    resolveRelationship(targetSpecies) {
        if (targetSpecies === "snake") return "threat";
        return "neutral";
    },
};
