import { AGENT_PROFILE, getAgentProfile } from "../../../AI/agents/agentProfile.js";
import { registerAliveAgent, markAgentDead, purgeInertAgentsForHead } from "../../../AI/agents/agentPopulationRegistry.js";
import { clearChainLinksForMembers } from "../../../Sandbox/chainLinks.js";
import { markSnakeSegmentsFracturable, shatterSnakeSegments } from "../snakeSegmentFracture.js";
import { clearSnakeSteeringLeaseFromProp } from "../snakeSteeringLease.js";
import { createAgentInstance } from "../AgentInstance.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { removeWorldPropFromState } from "../../../../GameState/EntityRegistry.js";
import { getSandboxEntityMeta } from "../../../../GameState/sandboxEntityMeta.js";
function resolveSpeciesFeatures(profileId, config = getSnakeGameConfig()) {
    const profile = getAgentProfile(profileId, config);
    const species = profile.species ?? {};
    return {
        retireNavOnDeath: species.retireNavOnDeath === true,
        fracturableBeforeShatter: species.fracturableBeforeShatter === true,
        removeNonStruckSegments: species.removeNonStruckSegments === true,
        pressureDiagnostics: species.pressureDiagnostics === true,
    };
}
function removeNonStruckSegments(state, connectedMembers, deathImpact, spatialFrame) {
    const struckId = deathImpact?.struckSegmentId ?? null;
    const meta = getSandboxEntityMeta(state);
    for (let i = 0; i < connectedMembers.length; i++) {
        const segmentId = connectedMembers[i];
        if (segmentId === struckId) continue;
        const segment = state.entityRegistry.getLive(segmentId);
        if (segment) removeWorldPropFromState(state, segment, spatialFrame ?? undefined, meta);
    }
}
export function createAgentSpecies(profileId) {
    const features = resolveSpeciesFeatures(profileId);
    return {
        id: profileId,
        createInstance(state, ctx) {
            return createAgentInstance(state, { profileId, head: ctx.head, spawnGroupId: ctx.spawnGroupId, navWalkable: ctx.navWalkable });
        },
        register(session, instance) {
            registerAliveAgent(session.registry, instance.headId, profileId, instance);
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
            const connectedMembers = instance.syncMembersFromGraph(state);
            let resolvedMembers = connectedMembers;
            if (features.retireNavOnDeath && typeof instance.retireAllSegments === "function") resolvedMembers = instance.retireAllSegments(state, session, connectedMembers);
            clearChainLinksForMembers(state, resolvedMembers);
            if (features.fracturableBeforeShatter) markSnakeSegmentsFracturable(state, connectedMembers);
            const spatialFrame = deathImpact?.spatialFrame ?? null;
            shatterSnakeSegments(state, spatialFrame, resolvedMembers, deathImpact);
            if (features.removeNonStruckSegments) removeNonStruckSegments(state, connectedMembers, deathImpact, spatialFrame);
            purgeInertAgentsForHead(session.registry, instance.headId);
            markAgentDead(session.registry, instance.headId);
            clearSnakeSteeringLeaseFromProp(instance.head);
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
        ...(features.pressureDiagnostics
            ? {
                  updateDiagnostics(instance, state) {
                      instance.updatePressureDiagnostics(state);
                  },
              }
            : {}),
    };
}
export const snakeSpecies = createAgentSpecies(AGENT_PROFILE.snake);
export const fleeAgentSpecies = createAgentSpecies(AGENT_PROFILE.flee);
export const squidSpecies = createAgentSpecies(AGENT_PROFILE.squid);
