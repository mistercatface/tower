import { WorldProp } from "../../../../Entities/WorldProp.js";
import { getSandboxEntityMeta } from "../../../../GameState/sandboxEntityMeta.js";
import { resolveChainLinkRestLength } from "../../../Sandbox/chainLinks.js";
import { resolveSandboxFaction, sandboxFactions } from "../../../Sandbox/sandboxFaction.js";
import { getPropAsset } from "../../../Props/PropCatalog.js";
import { getCirclePropRadius, getPolygonPropBoundingRadius, setCirclePropRadius, setPolygonPropBoundingRadius } from "../../../Props/propScale.js";
import { getSnakeGameConfig, resolveSnakeStartRadius, applySnakeSegmentGameplay } from "../snakeGameConfig.js";
import { syncFleeAgentWedgeFacing } from "./syncFleeAgentWedgeFacing.js";
import { spawnAgentChain } from "../../../Sandbox/spawnAgentChain.js";
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
    const bodyRadius = options.segmentRadius ?? resolveSnakeStartRadius(config);
    const forward = options.forwardDir ?? resolveFleeAgentForwardDir(config);
    const growDirX = -forward.x;
    const growDirY = -forward.y;
    const linkSlack = options.linkSlack ?? config.linkSlack;
    const bodyType = options.bodyPropId ?? fleeConfig.bodyPropId;
    const wedgeType = options.wedgePropId ?? fleeConfig.wedgePropId;
    const faction = options.faction ?? fleeConfig.faction ?? sandboxFactions.bravo;
    const exportType = options.exportType ?? FLEE_AGENT_EXPORT_TYPE;
    const pack = spawnAgentChain(state, anchorCell, {
        headPropId: wedgeType,
        bodyPropId: bodyType,
        segmentCount: FLEE_AGENT_CHAIN_MEMBER_COUNT,
        faction,
        exportType,
        linkSlack,
        segmentRadius: bodyRadius,
        growDirX,
        growDirY,
        headScaleFn: (wedge, radius) => scaleFleeAgentWedgeToBody(wedge, radius, wedgeType, config),
        onSegmentSpawned: (prop, index) => {
            if (index > 0) applySnakeSegmentGameplay(prop);
        },
        spawnGroupId: options.spawnGroupId,
    });
    const forwardHeading = Math.atan2(forward.y, forward.x);
    syncFleeAgentWedgeFacing(pack.head, pack.head, forwardHeading);
    return { head: pack.head, body: pack.members[1], members: pack.members, spawnGroupId: pack.spawnGroupId };
}
