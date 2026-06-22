import { getSandboxEntityMeta } from "../../../../GameState/sandboxEntityMeta.js";
import { setChainHead } from "../../../Sandbox/chainLinks.js";
import { spawnPlacedSandboxProp } from "../../../Sandbox/sandboxPlacedSpawn.js";
import { resolveSandboxFaction, sandboxFactions } from "../../../Sandbox/sandboxFaction.js";
import { setCirclePropRadius } from "../../../Props/propScale.js";
import { getSnakeGameConfig, resolveSnakeStartRadius, applySnakeSegmentGameplay } from "../snakeGameConfig.js";
export const FLEE_AGENT_EXPORT_TYPE = "flee_agent";
export const FLEE_AGENT_MEMBER_COUNT = 1;
export function resolveFleeAgentForwardDir(config = getSnakeGameConfig()) {
    return { x: -config.growDirX, y: -config.growDirY };
}
export function spawnFleeAgent(state, anchorCell, options = {}) {
    const config = getSnakeGameConfig();
    const fleeConfig = config.fleeAgent;
    const bodyRadius = options.segmentRadius ?? resolveSnakeStartRadius(config);
    const forward = options.forwardDir ?? resolveFleeAgentForwardDir(config);
    const propType = options.bodyPropId ?? fleeConfig.bodyPropId;
    const faction = options.faction ?? fleeConfig.faction ?? sandboxFactions.bravo;
    const exportType = options.exportType ?? FLEE_AGENT_EXPORT_TYPE;
    const grid = state.obstacleGrid;
    const meta = getSandboxEntityMeta(state);
    const anchorWorld = grid.gridToWorld(anchorCell.col, anchorCell.row);
    const head = spawnPlacedSandboxProp(state, anchorWorld.x, anchorWorld.y, propType, faction);
    setCirclePropRadius(head, bodyRadius);
    applySnakeSegmentGameplay(head);
    head.strategy.canChain = true;
    head.facing = Math.atan2(forward.y, forward.x);
    const spawnGroupId = options.spawnGroupId ?? `${exportType}:${head.id}`;
    meta.setSpawnGroupId(head.id, spawnGroupId);
    meta.setSpawnGroupExportType(head.id, exportType);
    meta.setSpawnGroupAnchor(head.id);
    setChainHead(state, meta, head.id);
    return { head, members: [head], spawnGroupId };
}
