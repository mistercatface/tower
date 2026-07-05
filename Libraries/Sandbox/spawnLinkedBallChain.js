import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
import { addChainLink, setChainHead } from "./chainLinks.js";
import { spawnPlacedSandboxProp } from "./sandboxPlacedSpawn.js";
import { resolveSandboxFaction, sandboxFactions } from "./sandboxFaction.js";
import { setPropRadius } from "../Props/props.js";
import { spawnAgentChain } from "./spawnAgentChain.js";
function segmentOffset(index, spacing, growDirX, growDirY) {
    return { x: index * spacing * growDirX, y: index * spacing * growDirY };
}
export function spawnLinkedBallChain(state, anchorIdx, options) {
    return spawnAgentChain(state, anchorIdx, {
        leaderIndex: 0,
        headPropId: options.headBallType ?? options.ballType,
        bodyPropId: options.ballType,
        segmentCount: options.segmentCount,
        faction: options.faction ?? sandboxFactions.alpha,
        exportType: options.exportType,
        linkSlack: options.linkSlack,
        segmentRadius: options.segmentRadius,
        growDirX: options.growDirX ?? -1,
        growDirY: options.growDirY ?? 0,
        spacing: options.spacing,
        spawnGroupId: options.spawnGroupId,
    });
}
export function growChainSegment(state, tailProp, options) {
    const spacing = options.spacing;
    const ballType = options.ballType;
    const growDirX = options.growDirX ?? -1;
    const growDirY = options.growDirY ?? 0;
    const faction = options.faction ?? resolveSandboxFaction(tailProp);
    const exportType = options.exportType ?? null;
    const meta = getSandboxEntityMeta(state);
    const spawnGroupId = options.spawnGroupId ?? meta.getSpawnGroupId(tailProp.id);
    const linkSlack = options.linkSlack ?? 1;
    const segmentRadius = options.segmentRadius ?? null;
    const offset = segmentOffset(1, spacing, growDirX, growDirY);
    const segment = spawnPlacedSandboxProp(state, tailProp.x + offset.x, tailProp.y + offset.y, ballType, faction);
    if (segmentRadius != null) setPropRadius(segment, segmentRadius);
    if (spawnGroupId) {
        meta.setSpawnGroupId(segment.id, spawnGroupId);
        if (exportType) meta.setSpawnGroupExportType(segment.id, exportType);
    }
    addChainLink(state, tailProp.id, segment.id, linkSlack);
    return segment;
}
export function linkedChainOccupiedCellIndices(members, grid) {
    const indices = new Set();
    for (let i = 0; i < members.length; i++) {
        const col = grid.worldCol(members[i].x);
        const row = grid.worldRow(members[i].y);
        indices.add(row * grid.cols + col);
    }
    return indices;
}
export function tryExportLinkedBallChainSpawnGroup(members, meta) {
    const exportType = meta.getSpawnGroupExportType(members[0].id);
    if (!exportType) return null;
    const anchor = members.find((prop) => meta.isSpawnGroupAnchor(prop.id)) ?? members[0];
    return { type: exportType, x: anchor.x, y: anchor.y, facing: anchor.facing, faction: resolveSandboxFaction(anchor), segmentCount: members.length };
}
