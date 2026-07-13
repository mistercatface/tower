import { spawnAgentChain, spawnPlacedSandboxProp, addChainLink } from "../../Libraries/Sandbox/sandbox.js";
import { setCirclePropRadius } from "../../Libraries/Props/props.js";

/** Test helper — maps legacy ball-chain option bags onto spawnAgentChain. */
export function spawnLinkedBallChain(state, anchorIdx, options) {
    const headPropId = options.headBallType ?? options.ballType;
    const growDirX = options.growDirX ?? -1;
    const growDirY = options.growDirY ?? 0;
    return spawnAgentChain(state, anchorIdx, {
        leaderIndex: 0,
        headPropId,
        bodyPropId: options.ballType,
        segmentCount: options.segmentCount,
        faction: options.faction,
        exportType: options.exportType,
        linkSlack: options.linkSlack,
        segmentRadius: options.segmentRadius,
        growDirX,
        growDirY,
        spacing: options.spacing,
        spawnGroupId: options.spawnGroupId,
    });
}

export function growChainSegment(state, tailProp, options) {
    const spacing = options.spacing;
    const ballType = options.ballType;
    const growDirX = options.growDirX ?? -1;
    const growDirY = options.growDirY ?? 0;
    const faction = options.faction ?? tailProp.faction;
    const exportType = options.exportType ?? null;
    const spawnGroupId = options.spawnGroupId ?? tailProp.spawnGroupId;
    const linkSlack = options.linkSlack ?? 1;
    const segmentRadius = options.segmentRadius ?? null;
    const offset = { x: spacing * growDirX, y: spacing * growDirY };
    const segment = spawnPlacedSandboxProp(state, tailProp.x + offset.x, tailProp.y + offset.y, ballType, faction);
    if (segmentRadius != null) setCirclePropRadius(segment, segmentRadius);
    if (spawnGroupId) {
        segment.spawnGroupId = spawnGroupId;
        if (exportType) segment.spawnGroupExportType = exportType;
    }
    addChainLink(state, tailProp.id, segment.id, linkSlack);
    return segment;
}
