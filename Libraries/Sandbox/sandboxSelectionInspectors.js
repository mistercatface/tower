import { FloorBelt } from "../Spatial/spatial.js";
import { cellInRect } from "../Spatial/spatial.js";
import { railWallEdgeAt } from "../Spatial/spatial.js";
import { getRailWallInfo, getVoxelWallInfo } from "./gridWallEdit.js";
export function selectionFloorCell(sel) {
    return sel?.kind === "floor" ? { idx: sel.idx } : null;
}
export function selectionVoxelCell(sel) {
    return sel?.kind === "voxel" ? { idx: sel.idx } : null;
}
export function selectionRailEdge(sel) {
    return sel?.kind === "rail" ? { idx: sel.idx, side: sel.side } : null;
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
    const { idx } = cell;
    const col = idx % grid.cols;
    const row = (idx / grid.cols) | 0;
    if (!cellInRect(idx, grid.cols, grid.rows)) return null;
    if (!(grid.floorKind[idx] !== 0)) return null;
    const kind = grid.floorKind[idx];
    const facingIndex = grid.floorFacing[idx];
    return { col, row, kind, facingIndex, kindLabel: FloorBelt.formatKindLabel(kind), facingLabel: FloorBelt.formatFacingLabel(facingIndex) };
}
export function buildVoxelWallInspectorInfo(state, sel) {
    const cell = selectionVoxelCell(sel);
    if (!cell) return null;
    const grid = state.obstacleGrid;
    const idx = cell.idx;
    const info = getVoxelWallInfo(grid, idx);
    if (info == null) return null;
    return { idx, heightLevel: grid.grid[idx] };
}
export function buildRailWallInspectorInfo(state, sel) {
    const edge = selectionRailEdge(sel);
    if (!edge) return null;
    const grid = state.obstacleGrid;
    const idx = edge.idx;
    return railWallEdgeAt(grid, idx, edge.side) ? getRailWallInfo(grid, idx, edge.side) : null;
}
