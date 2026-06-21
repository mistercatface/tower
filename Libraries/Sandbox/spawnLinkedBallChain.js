import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
import { addChainLink, setChainHead } from "./chainLinks.js";
import { spawnPlacedSandboxProp } from "./sandboxPlacedSpawn.js";
import { resolveSandboxFaction, sandboxFactions } from "./sandboxFaction.js";
import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { setCirclePropRadius } from "../Props/propScale.js";
function segmentOffset(index, spacing, growDirX, growDirY) {
    return { x: index * spacing * growDirX, y: index * spacing * growDirY };
}
export function spawnLinkedBallChain(state, anchorCell, options) {
    const segmentCount = options.segmentCount;
    const spacing = options.spacing;
    const ballType = options.ballType;
    const headBallType = options.headBallType ?? ballType;
    const faction = options.faction ?? sandboxFactions.alpha;
    const growDirX = options.growDirX ?? -1;
    const growDirY = options.growDirY ?? 0;
    const grid = state.obstacleGrid;
    const meta = getSandboxEntityMeta(state);
    const exportType = options.exportType ?? null;
    const linkSlack = options.linkSlack ?? 1;
    const segmentRadius = options.segmentRadius ?? null;
    const anchorWorld = grid.gridToWorld(anchorCell.col, anchorCell.row);
    const props = [];
    for (let i = 0; i < segmentCount; i++) {
        const offset = segmentOffset(i, spacing, growDirX, growDirY);
        const segmentType = i === 0 ? headBallType : ballType;
        const prop = spawnPlacedSandboxProp(state, anchorWorld.x + offset.x, anchorWorld.y + offset.y, segmentType, faction);
        if (segmentRadius != null) setCirclePropRadius(prop, segmentRadius);
        props.push(prop);
    }
    const spawnGroupId = options.spawnGroupId ?? `linkedBallChain:${props[0].id}`;
    for (let i = 0; i < props.length; i++) {
        meta.setSpawnGroupId(props[i].id, spawnGroupId);
        if (exportType) meta.setSpawnGroupExportType(props[i].id, exportType);
        if (i === 0) meta.setSpawnGroupAnchor(props[i].id);
    }
    for (let i = 0; i < props.length - 1; i++) addChainLink(state, props[i].id, props[i + 1].id, linkSlack);
    setChainHead(state, meta, props[0].id);
    return { head: props[0], tail: props[props.length - 1], members: props, spawnGroupId };
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
    if (segmentRadius != null) setCirclePropRadius(segment, segmentRadius);
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
        const { col, row } = grid.worldToGrid(members[i].x, members[i].y);
        indices.add(colRowToIndex(col, row, grid.cols));
    }
    return indices;
}
export function tryExportLinkedBallChainSpawnGroup(members, meta) {
    const exportType = meta.getSpawnGroupExportType(members[0].id);
    if (!exportType) return null;
    const anchor = members.find((prop) => meta.isSpawnGroupAnchor(prop.id)) ?? members[0];
    return { type: exportType, x: anchor.x, y: anchor.y, facing: anchor.facing, faction: resolveSandboxFaction(anchor), segmentCount: members.length };
}
