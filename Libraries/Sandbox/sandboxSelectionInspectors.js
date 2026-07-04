import { FloorBelt } from "../Spatial/grid/FloorCell.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { railWallEdgeAt } from "../Spatial/grid/gridCellTopology.js";
import { getRailWallInfo, getVoxelWallInfo } from "./gridWallEdit.js";
export function selectionFloorCell(sel) {
    return sel?.kind === "floor" ? { col: sel.col, row: sel.row } : null;
}
export function selectionVoxelCell(sel) {
    return sel?.kind === "voxel" ? { col: sel.col, row: sel.row } : null;
}
export function selectionRailEdge(sel) {
    return sel?.kind === "rail" ? { col: sel.col, row: sel.row, side: sel.side } : null;
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
    if (!grid.floorStore.hasAnyAtIdx(idx)) return null;
    const kind = grid.floorStore.kind[idx];
    const facingIndex = grid.floorStore.facing[idx];
    return { col, row, kind, facingIndex, kindLabel: FloorBelt.formatKindLabel(kind), facingLabel: FloorBelt.formatFacingLabel(facingIndex) };
}
export function buildVoxelWallInspectorInfo(state, sel) {
    const cell = selectionVoxelCell(sel);
    if (!cell) return null;
    const grid = state.obstacleGrid;
    const idx = cell.col + cell.row * grid.cols;
    const info = getVoxelWallInfo(grid, idx);
    if (info == null) return null;
    return { idx, heightLevel: grid.grid[idx] };
}
export function buildRailWallInspectorInfo(state, sel) {
    const edge = selectionRailEdge(sel);
    if (!edge) return null;
    const grid = state.obstacleGrid;
    const idx = edge.row * grid.cols + edge.col;
    return railWallEdgeAt(grid, idx, edge.side) ? getRailWallInfo(grid, idx, edge.side) : null;
}
