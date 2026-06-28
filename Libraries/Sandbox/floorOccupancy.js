import { cellBoundsAt, emptyCellBounds, growCellBounds, isEmptyCellBounds, forEachDenseCellInRect } from "../DataStructures/CellRect.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch, bumpFloorOccupancyStampDrawRevision } from "../Spatial/grid/gridNavEpoch.js";
import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { floorBeltFacingFromIndex, isFloorBeltKind, isFloorBeltRailsKind } from "../Spatial/grid/FloorCell.js";
import { stepCardinalFacing } from "../Math/Angle.js";
import { cellToGlobalColRow } from "../Spatial/grid/gridCellTopology.js";
import { DEFAULT_FLOOR_BELT_FORCE } from "./floorBeltDefaults.js";
import { markGridZoneSubscriptionsDirty } from "./gridZoneTick.js";
import { commitGridNavEdit } from "./gridNavEdit.js";
import { syncPassagePowerNetwork } from "./passagePowerNetwork.js";
import { applyKineticAccelerationAlongAngle } from "../Motion/applyAcceleration.js";
import { findGridAnchoredFloorPropAtCell } from "../Spatial/zones/floorShapes.js";
export const GRID_ROTATABLE_OCCUPANT = { FloorBelt: "floorBelt" };
export function pickRotatableGridOccupantAtWorld(state, worldX, worldY) {
    const grid = state.obstacleGrid;
    const col = grid.worldCol(worldX);
    const row = grid.worldRow(worldY);
    if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
    const idx = col + row * grid.cols;
    if (grid.floorStore.isBeltKindAtIdx(idx)) return { col, row, kind: GRID_ROTATABLE_OCCUPANT.FloorBelt };
    return null;
}
export function rotateGridOccupantAt(state, occupant, steps = 1) {
    const grid = state.obstacleGrid;
    const { col, row, kind } = occupant;
    const idx = col + row * grid.cols;
    if (kind === GRID_ROTATABLE_OCCUPANT.FloorBelt) {
        if (!grid.floorStore.isBeltKindAtIdx(idx)) return false;
        const beltKind = grid.floorStore.kind[idx];
        const facingRadians = floorBeltFacingFromIndex(grid.floorStore.facing[idx]);
        grid.writeFloorCell(idx, beltKind, stepCardinalFacing(facingRadians, steps));
        commitGridNavEdit(state, idx);
        return true;
    }
    throw new Error(`Unknown rotatable grid occupant kind: ${kind}`);
}
export function canStampFloorOccupancyAt(state, col, row) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    if (grid.isBlocked(col, row)) return false;
    if (grid.hasFloorOccupancy(col + row * grid.cols)) return false;
    if (findGridAnchoredFloorPropAtCell(state.worldProps, col, row)) return false;
    return true;
}
export const canStampFloorBeltAt = canStampFloorOccupancyAt;
export const canStampPassagePowerSourceAt = canStampFloorOccupancyAt;
export function stampFloorBeltsInBounds(grid, minCol, maxCol, minRow, maxRow, facingRadians) {
    let changed = false;
    forEachDenseCellInRect(minCol, maxCol, minRow, maxRow, grid.cols, (col, row) => {
        if (grid.writeFloorBelt(col + row * grid.cols, facingRadians)) changed = true;
    });
    return changed;
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
        if (!grid.floorStore.isBeltKindAtIdx(idx)) continue;
        const kind = grid.floorStore.kind[idx];
        const facingIndex = grid.floorStore.facing[idx];
        const beltAngle = floorBeltFacingFromIndex(facingIndex);
        applyKineticAccelerationAlongAngle(entity, beltAngle, force, dtSec);
    }
}
export function clearFloorOverlayAt(state, col, row) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    const idx = colRowToIndex(col, row, grid.cols);
    if (grid.floorStore.isPassagePowerSourceAtIdx(idx)) return clearPassagePowerSourceAt(state, col, row);
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
function notifyPassagePowerSourceLayoutChanged(state, grid) {
    bumpFloorOccupancyStampDrawRevision(grid);
    syncPassagePowerNetwork(state);
}
export function listPlacedFloorBeltsForSnapshot(grid) {
    return listFloorStoreOccupancy(
        grid,
        (grid, idx) => grid.floorStore.isBeltKindAtIdx(idx),
        (grid, idx, globalCol, globalRow) => ({ col: globalCol, row: globalRow, kind: grid.floorStore.kind[idx], facingIndex: grid.floorStore.facing[idx] }),
    );
}
export function applyFloorBeltsFromGlobal(state, floorBelts, cellSize) {
    const grid = state.obstacleGrid;
    const half = grid.cellHalfSize;
    let edgeChanged = false;
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
        if (isFloorBeltRailsKind(prevKind)) {
            grid.clearFloorBeltRailEdges(col, row, prevKind, prevFacing);
            edgeChanged = true;
        }
        const facing = ((facingIndex % 4) + 4) % 4;
        if (prevKind !== kind || prevFacing !== facing) floorNavChanged = true;
        grid.floorStore.setAtIdx(idx, kind, facing);
        if (isFloorBeltRailsKind(prevKind) || isFloorBeltRailsKind(kind)) edgeChanged = true;
        if (isFloorBeltRailsKind(kind)) grid.syncFloorBeltRailEdges(col, row, kind, facing);
        growCellBounds(bounds, col, row);
    }
    if (edgeChanged) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    if (floorNavChanged) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Floor);
    if (isEmptyCellBounds(bounds)) return null;
    markGridZoneSubscriptionsDirty(state);
    bumpFloorOccupancyStampDrawRevision(grid);
    return bounds;
}
export function stampPassagePowerSourceAt(state, col, row, defaultPowered = false) {
    if (!canStampFloorOccupancyAt(state, col, row)) return false;
    const grid = state.obstacleGrid;
    const idx = colRowToIndex(col, row, grid.cols);
    grid.floorStore.setPassagePowerSourceAtIdx(idx, defaultPowered);
    notifyPassagePowerSourceLayoutChanged(state, grid);
    return true;
}
export function clearPassagePowerSourceAt(state, col, row) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    const idx = colRowToIndex(col, row, grid.cols);
    if (!grid.floorStore.isPassagePowerSourceAtIdx(idx)) return false;
    grid.floorStore.clearAtIdx(idx);
    notifyPassagePowerSourceLayoutChanged(state, grid);
    return true;
}
export function listPlacedPassagePowerSourcesForSnapshot(grid) {
    return listFloorStoreOccupancy(
        grid,
        (grid, idx) => grid.floorStore.isPassagePowerSourceAtIdx(idx),
        (grid, idx, globalCol, globalRow) => {
            const entry = { col: globalCol, row: globalRow };
            if (grid.floorStore.passagePowerSourceDefaultPoweredAtIdx(idx)) entry.defaultPowered = true;
            return entry;
        },
    );
}
export function applyPassagePowerSourcesFromGlobal(state, powerSources, cellSize) {
    const grid = state.obstacleGrid;
    const half = grid.cellHalfSize;
    const bounds = emptyCellBounds();
    for (let i = 0; i < powerSources.length; i++) {
        const { col: globalCol, row: globalRow, defaultPowered } = powerSources[i];
        const col = grid.worldCol(globalCol * cellSize + half);
        const row = grid.worldRow(globalRow * cellSize + half);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        if (grid.isBlocked(col, row)) continue;
        if (grid.floorStore.isBeltKindAtIdx(colRowToIndex(col, row, grid.cols))) continue;
        const idx = colRowToIndex(col, row, grid.cols);
        grid.floorStore.setPassagePowerSourceAtIdx(idx, defaultPowered === true);
        growCellBounds(bounds, col, row);
    }
    if (isEmptyCellBounds(bounds)) return null;
    bumpFloorOccupancyStampDrawRevision(grid);
    return bounds;
}
