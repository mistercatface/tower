import { getSandboxEntityMeta } from "../../../../GameState/sandboxEntityMeta.js";
import { addChainLink, setChainHead } from "../../../Sandbox/chainLinks.js";
import { spawnPlacedSandboxProp } from "../../../Sandbox/sandboxPlacedSpawn.js";
import { setCirclePropRadius } from "../../../Props/propScale.js";
import { AGENT_PROFILE, getAgentProfile } from "../../../AI/agents/agentProfile.js";
import { getSnakeGameConfig, resolveSnakeSegmentSpacing, resolveSnakeStartRadius, applySquidBrainGameplay, applySquidSegmentGameplay } from "../snakeGameConfig.js";

export const SQUID_CHAIN_EXPORT_TYPE = "squid";

function spawnSegment(state, x, y, propId, faction, radius) {
    const prop = spawnPlacedSandboxProp(state, x, y, propId, faction);
    setCirclePropRadius(prop, radius);
    prop.strategy.canChain = true;
    return prop;
}

/** Three segments in a line: [arm] [brain] [arm]. Brain (index 1) owns steering. */
export function spawnSquidChain(state, anchorCell, options = {}) {
    const config = getSnakeGameConfig();
    const profile = getAgentProfile(AGENT_PROFILE.squid, config);
    const segmentCount = profile.segmentCount ?? 3;
    const brainIndex = profile.armSegmentCount ?? 1;
    const faction = options.faction ?? "charlie";
    const radius = options.segmentRadius ?? resolveSnakeStartRadius(config);
    const spacing = resolveSnakeSegmentSpacing(config, radius);
    const linkSlack = profile.linkSlack ?? 0.95;
    const growDirX = profile.growDirX ?? -1;
    const growDirY = profile.growDirY ?? 0;
    const grid = state.obstacleGrid;
    const meta = getSandboxEntityMeta(state);
    const anchorWorld = grid.gridToWorld(anchorCell.col, anchorCell.row);
    const members = [];
    let last = null;
    for (let i = 0; i < segmentCount; i++) {
        const propId = i === brainIndex ? (profile.brainPropId ?? profile.bodyPropId) : profile.bodyPropId;
        const seg = i === 0
            ? spawnSegment(state, anchorWorld.x, anchorWorld.y, propId, faction, radius)
            : spawnSegment(state, last.x + growDirX * spacing, last.y + growDirY * spacing, propId, faction, radius);
        if (i > 0) addChainLink(state, last.id, seg.id, linkSlack);
        members.push(seg);
        if (i === brainIndex) applySquidBrainGameplay(seg);
        else applySquidSegmentGameplay(seg);
        last = seg;
    }
    const brain = members[brainIndex];
    brain.facing = Math.atan2(growDirY, growDirX);
    const spawnGroupId = options.spawnGroupId ?? `${SQUID_CHAIN_EXPORT_TYPE}:${brain.id}`;
    for (let i = 0; i < members.length; i++) {
        meta.setSpawnGroupId(members[i].id, spawnGroupId);
        meta.setSpawnGroupExportType(members[i].id, SQUID_CHAIN_EXPORT_TYPE);
    }
    meta.setSpawnGroupAnchor(brain.id);
    setChainHead(state, meta, brain.id);
    return { brain, members, spawnGroupId, brainIndex };
}
