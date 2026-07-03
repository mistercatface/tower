import { emptyCellBounds, growCellBounds, isEmptyCellBounds } from "../DataStructures/CellRect.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch, bumpFloorOccupancyStampDrawRevision } from "../Spatial/grid/gridNavEpoch.js";
import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { floorBeltFacingFromIndex, isFloorBeltKind } from "../Spatial/grid/FloorCell.js";
import { cellToGlobalColRow } from "../Spatial/grid/gridCellTopology.js";
import { DEFAULT_FLOOR_BELT_FORCE } from "./floorBeltDefaults.js";
import { markGridZoneSubscriptionsDirty } from "./gridZoneTick.js";
import { commitGridNavEdit } from "./gridNavEdit.js";
import { applyKineticAccelerationAlongAngle } from "../Motion/motionDynamics.js";
import { findGridAnchoredFloorPropAtCell } from "../Spatial/zones/floorShapes.js";
export function pickRotatableGridOccupantAtWorld(state, worldX, worldY) {
    const grid = state.obstacleGrid;
    const col = grid.worldCol(worldX);
    const row = grid.worldRow(worldY);
    if (!cellInRect(col, row, grid.cols, grid.rows)) return -1;
    const idx = col + row * grid.cols;
    if (grid.floorStore.hasAnyAtIdx(idx)) return idx;
    return -1;
}
export function rotateGridOccupantAt(state, occupant, steps = 1) {
    const grid = state.obstacleGrid;
    const idx = typeof occupant === "number" ? occupant : occupant.col + occupant.row * grid.cols;
    if (!grid.floorStore.hasAnyAtIdx(idx)) return false;
    const beltKind = grid.floorStore.kind[idx];
    const facingIndex = (((grid.floorStore.facing[idx] + steps) % 4) + 4) % 4;
    grid.writeFloorCell(idx, beltKind, facingIndex);
    commitGridNavEdit(state, idx);
    return true;
}
export function canStampFloorBeltAt(state, colOrIdx, row = null) {
    const grid = state.obstacleGrid;
    const idx = row !== null ? colOrIdx + row * grid.cols : colOrIdx;
    if (idx < 0 || idx >= grid.cols * grid.rows) return false;
    const r = (idx / grid.cols) | 0;
    const c = idx - r * grid.cols;
    if (grid.isBlockedIdx(idx)) return false;
    if (grid.hasFloorOccupancy(idx)) return false;
    if (findGridAnchoredFloorPropAtCell(state.worldProps, c, r)) return false;
    return true;
}
/** Cell lookup + acceleration once per frame before kinetic physics substeps. */
export function tickFloorOccupancy(state, spatialFrame, dt) {
    const grid = state.obstacleGrid;
    if (!grid.floorStore.hasAny()) return;
    const kineticBodies = spatialFrame._kineticBodies;
    if (!kineticBodies?.length) return;
    const dtSec = dt / 1000;
    const force = DEFAULT_FLOOR_BELT_FORCE;
    for (let i = 0; i < kineticBodies.length; i++) {
        const entity = kineticBodies[i];
        const col = grid.worldCol(entity.x);
        const row = grid.worldRow(entity.y);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        const idx = col + row * grid.cols;
        if (!grid.floorStore.hasAnyAtIdx(idx)) continue;
        const kind = grid.floorStore.kind[idx];
        const facingIndex = grid.floorStore.facing[idx];
        const beltAngle = floorBeltFacingFromIndex(facingIndex);
        applyKineticAccelerationAlongAngle(entity, beltAngle, force, dtSec);
    }
}
export function clearFloorOverlayAt(state, colOrIdx, row = null) {
    const grid = state.obstacleGrid;
    const idx = row !== null ? colOrIdx + row * grid.cols : colOrIdx;
    if (idx < 0 || idx >= grid.cols * grid.rows) return false;
    if (!grid.clearFloorCell(idx)) return false;
    markGridZoneSubscriptionsDirty(state);
    return true;
}
function listFloorStoreOccupancy(grid, testAtIdx, buildEntry) {
    const items = [];
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        if (!testAtIdx(grid, idx)) continue;
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        const { globalCol, globalRow } = cellToGlobalColRow(grid, col, row);
        items.push(buildEntry(grid, idx, globalCol, globalRow));
    }
    return items;
}
export function listPlacedFloorBeltsForSnapshot(grid) {
    return listFloorStoreOccupancy(
        grid,
        (grid, idx) => grid.floorStore.hasAnyAtIdx(idx),
        (grid, idx, globalCol, globalRow) => ({ col: globalCol, row: globalRow, kind: grid.floorStore.kind[idx], facingIndex: grid.floorStore.facing[idx] }),
    );
}
export function applyFloorBeltsFromGlobal(state, floorBelts, cellSize) {
    const grid = state.obstacleGrid;
    const half = grid.cellHalfSize;
    const bounds = emptyCellBounds();
    let floorNavChanged = false;
    for (let i = 0; i < floorBelts.length; i++) {
        const { col: globalCol, row: globalRow, kind, facingIndex } = floorBelts[i];
        if (!isFloorBeltKind(kind)) throw new Error(`Invalid floor belt kind: ${kind}`);
        const col = grid.worldCol(globalCol * cellSize + half);
        const row = grid.worldRow(globalRow * cellSize + half);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        if (grid.isBlocked(col, row)) continue;
        const idx = colRowToIndex(col, row, grid.cols);
        const prevKind = grid.floorStore.kind[idx];
        const prevFacing = grid.floorStore.facing[idx];
        const facing = ((facingIndex % 4) + 4) % 4;
        if (prevKind !== kind || prevFacing !== facing) floorNavChanged = true;
        grid.floorStore.setAtIdx(idx, kind, facing);
        growCellBounds(bounds, col, row);
    }
    if (floorNavChanged) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Floor);
    if (isEmptyCellBounds(bounds)) return null;
    markGridZoneSubscriptionsDirty(state);
    bumpFloorOccupancyStampDrawRevision(grid);
    return bounds;
}
