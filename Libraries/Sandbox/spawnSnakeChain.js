import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
import { addChainLink, setChainHead } from "./chainLinks.js";
import { spawnPlacedSandboxProp } from "./sandboxPlacedSpawn.js";
import { SANDBOX_DEFAULT_FACTION, resolveSandboxFaction, sandboxFactions } from "./sandboxFaction.js";
import { cavernCellKey, pickRandomOpenCavernCell } from "./cavernFloorCells.js";
export const GOAL_ORB_PROP_TYPE = "goal_orb";
export const SNAKE_CHAIN_EXPORT_TYPE = "snake_chain";
export const DEFAULT_SNAKE_SEGMENT_COUNT = 3;
export const DEFAULT_SNAKE_SEGMENT_SPACING = 16;
export const DEFAULT_SNAKE_BALL_TYPE = "blue_ball";
export function spawnGoalOrb(state, worldX, worldY, faction = SANDBOX_DEFAULT_FACTION) {
    return spawnPlacedSandboxProp(state, worldX, worldY, GOAL_ORB_PROP_TYPE, faction);
}
export function spawnGoalOrbAtCell(state, cell, faction = SANDBOX_DEFAULT_FACTION) {
    const { x, y } = state.obstacleGrid.gridToWorld(cell.col, cell.row);
    return spawnGoalOrb(state, x, y, faction);
}
export function spawnGoalOrbOnOpenCell(state, { excludeKeys = null, faction = SANDBOX_DEFAULT_FACTION, rng = Math.random } = {}) {
    const cell = pickRandomOpenCavernCell(state, { excludeKeys, rng });
    if (!cell) throw new Error("Cavern has no open floor cell for goal orb");
    return spawnGoalOrbAtCell(state, cell, faction);
}
export function spawnSnakeChain(state, anchorCell, options = {}) {
    const segmentCount = options.segmentCount ?? DEFAULT_SNAKE_SEGMENT_COUNT;
    const spacing = options.spacing ?? DEFAULT_SNAKE_SEGMENT_SPACING;
    const ballType = options.ballType ?? DEFAULT_SNAKE_BALL_TYPE;
    const faction = options.faction ?? sandboxFactions.alpha;
    const grid = state.obstacleGrid;
    const meta = getSandboxEntityMeta(state);
    const spawnGroupId = options.spawnGroupId ?? `snakeChain:${Date.now()}`;
    const anchorWorld = grid.gridToWorld(anchorCell.col, anchorCell.row);
    const props = [];
    for (let i = 0; i < segmentCount; i++) {
        const prop = spawnPlacedSandboxProp(state, anchorWorld.x - i * spacing, anchorWorld.y, ballType, faction);
        meta.setSpawnGroupId(prop.id, spawnGroupId);
        meta.setSpawnGroupExportType(prop.id, SNAKE_CHAIN_EXPORT_TYPE);
        if (i === 0) meta.setSpawnGroupAnchor(prop.id);
        props.push(prop);
    }
    for (let i = 0; i < props.length - 1; i++) addChainLink(state, props[i].id, props[i + 1].id);
    setChainHead(state, meta, props[0].id);
    return { head: props[0], tail: props[props.length - 1], members: props, spawnGroupId };
}
export function snakeChainOccupiedCellKeys(members, grid) {
    const keys = new Set();
    for (let i = 0; i < members.length; i++) {
        const { col, row } = grid.worldToGrid(members[i].x, members[i].y);
        keys.add(cavernCellKey(col, row));
    }
    return keys;
}
export function tryExportSnakeChainSpawnGroup(members, meta) {
    const exportType = meta.getSpawnGroupExportType(members[0].id);
    if (exportType !== SNAKE_CHAIN_EXPORT_TYPE) return null;
    const anchor = members.find((prop) => meta.isSpawnGroupAnchor(prop.id)) ?? members[0];
    return { type: SNAKE_CHAIN_EXPORT_TYPE, x: anchor.x, y: anchor.y, facing: anchor.facing, faction: resolveSandboxFaction(anchor), segmentCount: members.length };
}

export function growSnakeChainSegment(state, tailProp, options = {}) {
    const spacing = options.spacing ?? DEFAULT_SNAKE_SEGMENT_SPACING;
    const ballType = options.ballType ?? DEFAULT_SNAKE_BALL_TYPE;
    const faction = options.faction ?? resolveSandboxFaction(tailProp);
    const meta = getSandboxEntityMeta(state);
    const spawnGroupId = options.spawnGroupId ?? meta.getSpawnGroupId(tailProp.id);
    const segment = spawnPlacedSandboxProp(state, tailProp.x - spacing, tailProp.y, ballType, faction);
    if (spawnGroupId) {
        meta.setSpawnGroupId(segment.id, spawnGroupId);
        meta.setSpawnGroupExportType(segment.id, SNAKE_CHAIN_EXPORT_TYPE);
    }
    addChainLink(state, tailProp.id, segment.id);
    return segment;
}
