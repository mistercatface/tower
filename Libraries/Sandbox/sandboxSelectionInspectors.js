import { floorBeltFacingFromIndex, formatFloorBeltFacingLabel, formatFloorBeltKindLabel } from "../Spatial/grid/FloorCell.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { forcefieldEdgeAt, railWallEdgeAt } from "../Spatial/grid/gridCellTopology.js";
import { formatRoomLinkCorridorLabel, formatRoomNodeLabel, getRoomLink, getRoomNode } from "../RoomGraph/index.js";
import { linkCorridorLimits, MAX_CORRIDOR_COUNT, resolveLinkCorridorRoll } from "../RoomGraph/roomGraphLinkCorridor.js";
import { normalizeCorridorType } from "../RoomGraph/roomGraphCorridorTypes.js";
import { createSeededRng } from "../Math/SeededRng.js";
import { getForcefieldInfo, getRailWallInfo, getVoxelWallInfo } from "./gridWallEdit.js";
export function selectionFloorCell(sel) {
    return sel?.kind === "floor" ? { col: sel.col, row: sel.row } : null;
}
export function selectionVoxelCell(sel) {
    return sel?.kind === "voxel" ? { col: sel.col, row: sel.row } : null;
}
export function selectionRailEdge(sel) {
    return sel?.kind === "rail" ? { col: sel.col, row: sel.row, side: sel.side } : null;
}
export function selectionRoomNodeId(sel) {
    if (sel?.kind === "roomNode") return sel.id;
    if (sel?.kind === "roomLink") return sel.nodeId;
    return null;
}
export function selectionRoomLinkId(sel) {
    return sel?.kind === "roomLink" ? sel.linkId : null;
}
export function selectionRoomLinkCorridorIndex(sel) {
    return sel?.kind === "roomLink" ? sel.corridorIndex : 0;
}
export function selectionPropIds(sel) {
    return sel?.kind === "prop" ? [...sel.ids] : [];
}
export function selectionPrimaryPropId(sel, isLiveProp) {
    if (sel?.kind !== "prop") return null;
    for (const id of sel.ids) if (isLiveProp(id)) return id;
    return null;
}
export function buildFloorBeltInspectorInfo(state, sel) {
    const cell = selectionFloorCell(sel);
    if (!cell) return null;
    const grid = state.obstacleGrid;
    const { col, row } = cell;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
    const idx = col + row * grid.cols;
    if (!grid.floorStore.isBeltKindAtIdx(idx)) return null;
    const kind = grid.floorStore.kind[idx];
    const facingIndex = grid.floorStore.facing[idx];
    return { col, row, kind, facingIndex, kindLabel: formatFloorBeltKindLabel(kind), facingLabel: formatFloorBeltFacingLabel(facingIndex) };
}
export function buildPassagePowerSourceInspectorInfo(state, sel) {
    const cell = selectionFloorCell(sel);
    if (!cell) return null;
    const grid = state.obstacleGrid;
    const { col, row } = cell;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
    const idx = col + row * grid.cols;
    if (!grid.floorStore.isPassagePowerSourceAtIdx(idx)) return null;
    return { col, row, defaultPowered: grid.floorStore.passagePowerSourceDefaultPoweredAtIdx(idx) };
}
export function buildVoxelWallInspectorInfo(state, sel) {
    const cell = selectionVoxelCell(sel);
    return cell ? getVoxelWallInfo(state.obstacleGrid, cell.col, cell.row) : null;
}
export function buildRailWallInspectorInfo(state, sel) {
    const edge = selectionRailEdge(sel);
    if (!edge) return null;
    const grid = state.obstacleGrid;
    const idx = edge.row * grid.cols + edge.col;
    return railWallEdgeAt(grid, idx, edge.side) ? getRailWallInfo(grid, idx, edge.side) : null;
}
export function buildForcefieldInspectorInfo(state, sel) {
    const edge = selectionRailEdge(sel);
    if (!edge) return null;
    const grid = state.obstacleGrid;
    const idx = edge.row * grid.cols + edge.col;
    return forcefieldEdgeAt(grid, idx, edge.side) ? getForcefieldInfo(grid, idx, edge.side) : null;
}
export function buildRoomNodeInspectorInfo(state, sel) {
    const id = selectionRoomNodeId(sel);
    if (id == null) return null;
    const node = getRoomNode(state, id);
    if (!node) return null;
    return { ...node, label: formatRoomNodeLabel(node) };
}
export function buildRoomLinkInspectorInfo(state, sel) {
    const linkId = selectionRoomLinkId(sel);
    if (linkId == null) return null;
    const link = getRoomLink(state, linkId);
    if (!link) return null;
    const corridorIndex = selectionRoomLinkCorridorIndex(sel);
    const nodeA = getRoomNode(state, link.a);
    const nodeB = getRoomNode(state, link.b);
    const limits = nodeA && nodeB ? linkCorridorLimits(nodeA, nodeB) : null;
    const roll = nodeA && nodeB ? resolveLinkCorridorRoll(link, nodeA, nodeB, createSeededRng(link.seed ?? link.id * 9973)) : null;
    return {
        ...link,
        corridorType: normalizeCorridorType(link.corridorType),
        label: formatRoomLinkCorridorLabel(link, corridorIndex),
        corridorIndex,
        maxCorridorWidth: limits?.maxWidth ?? null,
        maxCorridorCount: MAX_CORRIDOR_COUNT,
        rolledCorridorCount: roll?.corridorCount ?? null,
        rolledCorridorWidths: roll?.corridorWidths ?? null,
    };
}
export function resolveSelectedRoomNode(state, sel) {
    const id = selectionRoomNodeId(sel);
    return id == null ? null : (getRoomNode(state, id) ?? null);
}
export function resolveSelectedRoomLink(state, sel) {
    const id = selectionRoomLinkId(sel);
    return id == null ? null : (getRoomLink(state, id) ?? null);
}
