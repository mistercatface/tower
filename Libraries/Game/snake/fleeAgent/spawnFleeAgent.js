import { WorldProp } from "../../../../Entities/WorldProp.js";
import { getSandboxEntityMeta } from "../../../../GameState/sandboxEntityMeta.js";
import { addChainLink, resolveChainLinkRestLength, setChainHead } from "../../../Sandbox/chainLinks.js";
import { spawnPlacedSandboxProp } from "../../../Sandbox/sandboxPlacedSpawn.js";
import { resolveSandboxFaction, sandboxFactions } from "../../../Sandbox/sandboxFaction.js";
import { getPropAsset } from "../../../Props/PropCatalog.js";
import { getCirclePropRadius, getPolygonPropBoundingRadius, setCirclePropRadius, setPolygonPropBoundingRadius } from "../../../Props/propScale.js";
import { getSnakeGameConfig, resolveSnakeStartRadius, applySnakeSegmentGameplay } from "../snakeGameConfig.js";
import { syncFleeAgentWedgeFacing } from "./syncFleeAgentWedgeFacing.js";
export const FLEE_AGENT_EXPORT_TYPE = "flee_agent";
export const FLEE_AGENT_CHAIN_MEMBER_COUNT = 2;
export function resolveFleeAgentForwardDir(config = getSnakeGameConfig()) {
    return { x: -config.growDirX, y: -config.growDirY };
}
export function resolveFleeAgentWedgeRadius(bodyRadius, config = getSnakeGameConfig()) {
    return bodyRadius * (config.fleeAgent?.wedgeRadiusScale ?? 1);
}
export function resolveFleeAgentChainSpacing(config = getSnakeGameConfig(), bodyRadius = null) {
    const radius = bodyRadius ?? resolveSnakeStartRadius(config);
    return (radius + resolveFleeAgentWedgeRadius(radius, config)) * config.linkSlack;
}
function scaleFleeAgentWedgeToBody(wedge, bodyRadius, wedgePropId, config) {
    const wedgeRadius = resolveFleeAgentWedgeRadius(bodyRadius, config);
    setPolygonPropBoundingRadius(wedge, wedgeRadius);
}
export function spawnFleeAgent(state, anchorCell, options = {}) {
    const config = getSnakeGameConfig();
    const fleeConfig = config.fleeAgent;
    const grid = state.obstacleGrid;
    const meta = getSandboxEntityMeta(state);
    const bodyRadius = options.segmentRadius ?? resolveSnakeStartRadius(config);
    const forward = options.forwardDir ?? resolveFleeAgentForwardDir(config);
    const growDirX = forward.x;
    const growDirY = forward.y;
    const linkSlack = options.linkSlack ?? config.linkSlack;
    const bodyType = options.bodyPropId ?? fleeConfig.bodyPropId;
    const wedgeType = options.wedgePropId ?? fleeConfig.wedgePropId;
    const faction = options.faction ?? fleeConfig.faction ?? sandboxFactions.bravo;
    const exportType = options.exportType ?? FLEE_AGENT_EXPORT_TYPE;
    const anchorWorld = grid.gridToWorld(anchorCell.col, anchorCell.row);
    const body = spawnPlacedSandboxProp(state, anchorWorld.x, anchorWorld.y, bodyType, faction);
    setCirclePropRadius(body, bodyRadius);
    applySnakeSegmentGameplay(body);
    const wedge = spawnPlacedSandboxProp(state, anchorWorld.x, anchorWorld.y, wedgeType, faction);
    scaleFleeAgentWedgeToBody(wedge, bodyRadius, wedgeType, config);
    const restLength = resolveChainLinkRestLength(body, wedge, linkSlack);
    wedge.x = anchorWorld.x + growDirX * restLength;
    wedge.y = anchorWorld.y + growDirY * restLength;
    const forwardHeading = Math.atan2(growDirY, growDirX);
    syncFleeAgentWedgeFacing(body, wedge, forwardHeading);
    const spawnGroupId = options.spawnGroupId ?? `fleeAgent:${body.id}`;
    meta.setSpawnGroupId(body.id, spawnGroupId);
    meta.setSpawnGroupId(wedge.id, spawnGroupId);
    meta.setSpawnGroupExportType(body.id, exportType);
    meta.setSpawnGroupExportType(wedge.id, exportType);
    meta.setSpawnGroupAnchor(body.id);
    addChainLink(state, body.id, wedge.id, linkSlack);
    setChainHead(state, meta, body.id);
    return { head: body, wedge, members: [body, wedge], spawnGroupId };
}
