import { spawnAgentChain } from "../../Sandbox/spawnAgentChain.js";
import { getAgentProfile, AGENT_PROFILE } from "../../AI/agents/agentProfile.js";
import { getSnakeGameConfig, resolveSnakeSegmentSpacing, resolveSnakeStartRadius } from "./snakeGameConfig.js";
import { applyAgentGameplayForIndex } from "./applyAgentGameplay.js";

export function resolveProfileLeaderIndex(profile) {
    return profile.leaderIndex ?? profile.armSegmentCount ?? 0;
}

export function resolveFleeAgentForwardDir(config = getSnakeGameConfig()) {
    const snake = config.agentProfiles.snake;
    return { x: -snake.growDirX, y: -snake.growDirY };
}

function onChainSegmentSpawned(profileId, leaderIndex) {
    return (prop, index) => {
        prop.strategy.canChain = true;
        applyAgentGameplayForIndex(profileId, prop, index, leaderIndex);
    };
}

function buildChainSpawnSpec(profileId, config, options = {}) {
    const profile = getAgentProfile(profileId, config);
    const leaderIndex = resolveProfileLeaderIndex(profile);
    const segmentCount = options.segmentCount ?? profile.segmentCount ?? 1;
    const segmentRadius = options.segmentRadius ?? resolveSnakeStartRadius(config);
    const spacing = options.spacing ?? resolveSnakeSegmentSpacing(config, segmentRadius);
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
        onSegmentSpawned: onChainSegmentSpawned(profileId, leaderIndex),
    };
    
    const headPropId = options.headPropId ?? profile.headPropId;
    const bodyPropId = options.bodyPropId ?? profile.bodyPropId;
    const leaderPropId = options.leaderPropId ?? profile.leaderPropId ?? profile.brainPropId;
    
    if (leaderPropId) {
        base.leaderPropId = leaderPropId;
    }
    if (headPropId) {
        base.headPropId = headPropId;
    }
    if (bodyPropId) {
        base.bodyPropId = bodyPropId;
    }
    
    return base;
}

function finalizeChainSpawn(profileId, chain, { growDirX = -1, growDirY = 0, forwardDir = null } = {}) {
    const leader = chain.leader;
    const profile = getAgentProfile(profileId);
    
    // Check if agent moves like a ball (single segment facing forward)
    if (profile.segmentCount === 1) {
        const forward = forwardDir ?? resolveFleeAgentForwardDir();
        leader.facing = Math.atan2(forward.y, forward.x);
    } else {
        leader.facing = Math.atan2(growDirY, growDirX);
    }
    
    return { 
        ...chain, 
        brain: leader, 
        brainIndex: chain.leaderIndex, 
        head: profile.segmentCount === 1 ? leader : chain.head 
    };
}

/** Spawn a profile-configured agent chain. */
export function spawnGameAgentChain(state, anchorCell, profileId, options = {}) {
    const config = getSnakeGameConfig();
    const spec = buildChainSpawnSpec(profileId, config, options);
    const chain = spawnAgentChain(state, anchorCell, spec);
    return finalizeChainSpawn(profileId, chain, { 
        growDirX: spec.growDirX, 
        growDirY: spec.growDirY, 
        forwardDir: options.forwardDir 
    });
}
