import { spawnAgentChain } from "../../Sandbox/spawnAgentChain.js";
import { getAgentProfile, AGENT_PROFILE } from "../../AI/agents/agentProfile.js";
import { resolveSnakeSegmentSpacing } from "./snakeGameConfig.js";
import { applyAgentGameplay } from "./applyAgentGameplay.js";
export function resolveProfileLeaderIndex(profile) {
    return profile.leaderIndex ?? profile.armSegmentCount ?? 0;
}
export function resolveFleeAgentForwardDir(snakeProfile = getAgentProfile(AGENT_PROFILE.snake)) {
    return { x: -snakeProfile.growDirX, y: -snakeProfile.growDirY };
}
function applySpawnedChainGameplay(profile, chain) {
    const leaderGameplay = profile.gameplay.leader;
    const bodyGameplay = profile.gameplay.body;
    for (let i = 0; i < chain.leaderIndex; i++) {
        chain.members[i].strategy.canChain = true;
        applyAgentGameplay(bodyGameplay, chain.members[i]);
    }
    chain.leader.strategy.canChain = true;
    applyAgentGameplay(leaderGameplay, chain.leader);
    for (let i = chain.leaderIndex + 1; i < chain.members.length; i++) {
        chain.members[i].strategy.canChain = true;
        applyAgentGameplay(bodyGameplay, chain.members[i]);
    }
}
function buildChainSpawnSpec(profile, config, options = {}) {
    const leaderIndex = resolveProfileLeaderIndex(profile);
    const segmentCount = options.segmentCount ?? profile.segmentCount ?? 1;
    const segmentRadius = options.segmentRadius ?? config.startRadius;
    const spacing = options.spacing ?? resolveSnakeSegmentSpacing(profile.linkSlack, segmentRadius);
    const growDirX = options.growDirX ?? profile.growDirX ?? -1;
    const growDirY = options.growDirY ?? profile.growDirY ?? 0;
    const linkSlack = options.linkSlack ?? profile.linkSlack ?? 1;
    const base = {
        leaderIndex,
        segmentCount,
        segmentRadius,
        spacing,
        growDirX,
        growDirY,
        linkSlack,
        faction: options.faction,
        exportType: options.exportType ?? profile.exportType ?? null,
        spawnGroupId: options.spawnGroupId,
    };
    const headPropId = options.headPropId ?? profile.headPropId;
    const bodyPropId = options.bodyPropId ?? profile.bodyPropId;
    const leaderPropId = options.leaderPropId ?? profile.leaderPropId ?? profile.brainPropId;
    if (leaderPropId) base.leaderPropId = leaderPropId;
    if (headPropId) base.headPropId = headPropId;
    if (bodyPropId) base.bodyPropId = bodyPropId;
    return base;
}
function finalizeChainSpawn(chain, spec, forwardDir = null) {
    const leader = chain.leader;
    if (spec.segmentCount === 1) {
        const forward = forwardDir ?? resolveFleeAgentForwardDir();
        leader.facing = Math.atan2(forward.y, forward.x);
    } else leader.facing = Math.atan2(spec.growDirY, spec.growDirX);
    return { ...chain, brain: leader, brainIndex: chain.leaderIndex, head: spec.segmentCount === 1 ? leader : chain.head };
}
/** Spawn a profile-configured agent chain. */
export function spawnGameAgentChain(state, anchorCell, profileId, options = {}) {
    const config = state.sandbox.snakeGame.config;
    const profile = getAgentProfile(profileId, config);
    const spec = buildChainSpawnSpec(profile, config, options);
    const chain = spawnAgentChain(state, anchorCell, spec);
    applySpawnedChainGameplay(profile, chain);
    return finalizeChainSpawn(chain, spec, options.forwardDir);
}
