import { getConnectedBodyIds } from "../../../Motion/kineticConstraintGraph.js";
import { createAgentInstance } from "../AgentInstance.js";
import { AGENT_PROFILE } from "../../../AI/agents/agentProfile.js";
import { registerAliveAgent, markAgentDead, purgeInertAgentsForHead } from "../../../AI/agents/agentPopulationRegistry.js";
import { clearChainLinksForMembers } from "../../../Sandbox/chainLinks.js";
import { markSnakeSegmentsFracturable, shatterSnakeSegments } from "../snakeSegmentFracture.js";
import { clearSnakeSteeringLeaseFromProp } from "../snakeSteeringLease.js";
import { getAgentProfile } from "../../../AI/agents/agentProfile.js";
import { removeWorldPropFromState } from "../../../../GameState/EntityRegistry.js";
import { getSandboxEntityMeta } from "../../../../GameState/sandboxEntityMeta.js";
function segmentCount(state, headId) {
    return getConnectedBodyIds(state.kinetic, headId).length;
}
function sizeRelationship(seekerSegs, targetSegs) {
    const maxGap = getAgentProfile(AGENT_PROFILE.squid).rivalBand?.maxSegmentGap ?? 2;
    if (Math.abs(seekerSegs - targetSegs) <= maxGap) return "rival";
    if (targetSegs > seekerSegs) return "threat";
    if (targetSegs < seekerSegs) return "prey";
    return "neutral";
}
export const squidSpecies = {
    id: "squid",
    createInstance(state, ctx) {
        return createAgentInstance(state, { profileId: AGENT_PROFILE.squid, headId: ctx.headId, spawnGroupId: ctx.spawnGroupId, navWalkable: ctx.navWalkable });
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
        clearChainLinksForMembers(state, connectedMembers);
        markSnakeSegmentsFracturable(state, connectedMembers);
        const spatialFrame = deathImpact?.spatialFrame ?? null;
        shatterSnakeSegments(state, spatialFrame, connectedMembers, deathImpact);
        const struckId = deathImpact?.struckSegmentId ?? null;
        const meta = getSandboxEntityMeta(state);
        for (let i = 0; i < connectedMembers.length; i++) {
            const segmentId = connectedMembers[i];
            if (segmentId === struckId) continue;
            const segment = state.entityRegistry.getLive(segmentId);
            if (segment) removeWorldPropFromState(state, segment, spatialFrame ?? undefined, meta);
        }
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
    updateDiagnostics(instance, state) {
        instance.updatePressureDiagnostics(state);
    },
    resolveRelationship(targetSpecies, seekerId, targetId, state) {
        const seekerHead = state.entityRegistry.getLive(seekerId);
        const targetHead = state.entityRegistry.getLive(targetId);
        const seekerFaction = seekerHead?.faction ?? null;
        const targetFaction = targetHead?.faction ?? null;
        if (seekerFaction && targetFaction && seekerFaction === targetFaction) return "neutral";
        if (targetSpecies === "flee_agent") return "prey";
        if (targetSpecies === "snake" || targetSpecies === "squid") return sizeRelationship(segmentCount(state, seekerId), segmentCount(state, targetId));
        return "neutral";
    },
};
