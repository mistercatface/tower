import { spawnAgentChain } from "../../Libraries/Sandbox/sandbox.js";

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
