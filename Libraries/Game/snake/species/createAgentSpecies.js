import { AGENT_PROFILE, getAgentProfile } from "../../../AI/agents/agentProfile.js";
import { registerAliveAgent, markAgentDead, purgeInertAgentsForHead } from "../../../AI/agents/agentPopulationRegistry.js";
import { clearChainLinksForMembers } from "../../../Sandbox/chainLinks.js";
import { markSnakeSegmentsFracturable, shatterSnakeSegments, spawnAmmoShards } from "../snakeSegmentFracture.js";
import { clearSnakeSteeringLeaseFromProp } from "../snakeSteeringLease.js";
import { AgentInstance } from "../AgentInstance.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { removeWorldPropFromState } from "../../../../GameState/EntityRegistry.js";
import { getSandboxEntityMeta } from "../../../../GameState/sandboxEntityMeta.js";
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
    const species = getAgentProfile(profileId, getSnakeGameConfig()).species ?? {};
    const retireNavOnDeath = species.retireNavOnDeath === true;
    const fracturableBeforeShatter = species.fracturableBeforeShatter === true;
    const removeNonStruckSegmentsOnDeath = species.removeNonStruckSegments === true;
    const pressureDiagnostics = species.pressureDiagnostics === true;
    return {
        id: profileId,
        pressureDiagnostics,
        createInstance(state, ctx) {
            return new AgentInstance(state, { profileId, head: ctx.head, spawnGroupId: ctx.spawnGroupId });
        },
        register(session, instance) {
            registerAliveAgent(session.registry, instance.headId, profileId, instance);
        },
        die(instance, state, deathImpact = null) {
            instance.lifecycle = "dead";
            instance.stopSteering();
            if (instance.ammo > 0) {
                spawnAmmoShards(state, instance.head, instance.ammo, deathImpact?.spatialFrame);
            }
            const snakeGame = state.sandbox.snakeGame;
            const connectedMembers = instance.syncMembersFromGraph();
            let resolvedMembers = connectedMembers;
            if (retireNavOnDeath) resolvedMembers = instance.retireAllSegments(state, connectedMembers);
            clearChainLinksForMembers(state, resolvedMembers);
            if (fracturableBeforeShatter) markSnakeSegmentsFracturable(state, connectedMembers);
            const spatialFrame = deathImpact?.spatialFrame ?? null;
            shatterSnakeSegments(state, spatialFrame, resolvedMembers, deathImpact);
            if (removeNonStruckSegmentsOnDeath) removeNonStruckSegments(state, connectedMembers, deathImpact, spatialFrame);
            purgeInertAgentsForHead(snakeGame.registry, instance.headId);
            markAgentDead(snakeGame.registry, instance.headId);
            clearSnakeSteeringLeaseFromProp(instance.head);
            if (state.followCamera?.targetProp?.id === instance.headId) state.followCamera.clear();
        },
    };
}
