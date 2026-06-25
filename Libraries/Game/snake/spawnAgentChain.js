import { spawnAgentChain } from "../../Sandbox/spawnAgentChain.js";
import { AGENT_PROFILE, getAgentProfile } from "../../AI/agents/agentProfile.js";
import { getSnakeGameConfig, resolveSnakeSegmentSpacing, resolveSnakeStartRadius } from "./snakeGameConfig.js";
import { applyAgentGameplayForIndex } from "./applyAgentGameplay.js";
export const FLEE_AGENT_EXPORT_TYPE = "flee_agent";
export const SQUID_CHAIN_EXPORT_TYPE = "squid";
export const GUN_AGENT_EXPORT_TYPE = "gun_agent";
export function resolveProfileLeaderIndex(profile) {
    return profile.leaderIndex ?? profile.armSegmentCount ?? 0;
}
export function resolveFleeAgentForwardDir(config = getSnakeGameConfig()) {
    const snake = config.agentProfiles.snake;
    return { x: -snake.growDirX, y: -snake.growDirY };
}
function resolveChainExportType(profileId, profile, options) {
    if (options.exportType) return options.exportType;
    if (profileId === AGENT_PROFILE.flee) return FLEE_AGENT_EXPORT_TYPE;
    if (profileId === AGENT_PROFILE.squid) return SQUID_CHAIN_EXPORT_TYPE;
    if (profileId === AGENT_PROFILE.gun) return GUN_AGENT_EXPORT_TYPE;
    return options.exportType ?? null;
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
        exportType: resolveChainExportType(profileId, profile, options),
        spawnGroupId: options.spawnGroupId,
    };
    if (profileId === AGENT_PROFILE.snake)
        return { ...base, headPropId: options.headPropId ?? profile.headPropId, bodyPropId: options.bodyPropId ?? profile.bodyPropId, onSegmentSpawned: onChainSegmentSpawned(profileId, leaderIndex) };
    if (profileId === AGENT_PROFILE.flee || profileId === AGENT_PROFILE.gun)
        return { ...base, segmentCount: 1, leaderIndex: 0, bodyPropId: options.bodyPropId ?? profile.bodyPropId, onSegmentSpawned: onChainSegmentSpawned(profileId, 0) };
    if (profileId === AGENT_PROFILE.squid)
        return {
            ...base,
            leaderPropId: options.leaderPropId ?? profile.brainPropId ?? profile.bodyPropId,
            bodyPropId: options.bodyPropId ?? profile.bodyPropId,
            onSegmentSpawned: onChainSegmentSpawned(profileId, leaderIndex),
        };
    throw new Error(`spawnGameAgentChain: unsupported profile ${profileId}`);
}
function finalizeChainSpawn(profileId, chain, { growDirX = -1, growDirY = 0, forwardDir = null } = {}) {
    const leader = chain.leader;
    if (profileId === AGENT_PROFILE.flee || profileId === AGENT_PROFILE.gun) {
        const forward = forwardDir ?? resolveFleeAgentForwardDir();
        leader.facing = Math.atan2(forward.y, forward.x);
    } else if (profileId === AGENT_PROFILE.squid) leader.facing = Math.atan2(growDirY, growDirX);
    return { ...chain, brain: leader, brainIndex: chain.leaderIndex, head: profileId === AGENT_PROFILE.flee || profileId === AGENT_PROFILE.gun ? leader : chain.head };
}
/** Spawn a profile-configured agent chain. Flee = 1 segment; snake leader @ 0; squid leader @ profile leaderIndex. */
export function spawnGameAgentChain(state, anchorCell, profileId, options = {}) {
    const config = getSnakeGameConfig();
    const spec = buildChainSpawnSpec(profileId, config, options);
    const chain = spawnAgentChain(state, anchorCell, spec);
    return finalizeChainSpawn(profileId, chain, { growDirX: spec.growDirX, growDirY: spec.growDirY, forwardDir: options.forwardDir });
}
export const FLEE_AGENT_MEMBER_COUNT = 1;
export function spawnFleeAgent(state, anchorCell, options = {}) {
    const config = getSnakeGameConfig();
    const flee = getAgentProfile(AGENT_PROFILE.flee, config);
    return spawnGameAgentChain(state, anchorCell, AGENT_PROFILE.flee, { ...options, faction: options.faction ?? flee.faction });
}
export function spawnSquidChain(state, anchorCell, options = {}) {
    return spawnGameAgentChain(state, anchorCell, AGENT_PROFILE.squid, { faction: options.faction ?? "charlie", ...options });
}
export function spawnGunAgent(state, anchorCell, options = {}) {
    const config = getSnakeGameConfig();
    const gun = getAgentProfile(AGENT_PROFILE.gun, config);
    return spawnGameAgentChain(state, anchorCell, AGENT_PROFILE.gun, { ...options, faction: options.faction ?? gun.faction });
}
