import { cellBoundsAt, emptyCellBounds, growCellBounds, isEmptyCellBounds, forEachDenseCellInRect } from "../DataStructures/CellRect.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch, bumpFloorOccupancyStampDrawRevision } from "../Spatial/grid/gridNavEpoch.js";
import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { floorBeltFacingFromIndex, floorBeltElbowTurn, isFloorBeltKind, isFloorBeltRailsKind } from "../Spatial/grid/FloorCell.js";
import { stepCardinalFacing } from "../Math/Angle.js";
import { cellToGlobalColRow } from "../Spatial/grid/gridCellTopology.js";
import { fillCircle } from "../Canvas/CanvasPath.js";
import { drawCachedFloorOccupancyBelts, drawCachedFloorOccupancyPowerSources, syncFloorOccupancyStampDrawCache } from "./gridStampDrawCache.js";
import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { createConveyorDraw } from "../Render/conveyorDraw.js";
import { DEFAULT_FLOOR_BELT_FORCE } from "./floorBeltDefaults.js";
import { markGridZoneSubscriptionsDirty } from "./gridZoneTick.js";
import { commitGridNavEdit } from "./gridNavEdit.js";
import { syncPassagePowerNetwork, isPassagePowerSourceEnergized } from "./passagePowerNetwork.js";
import { applyKineticAccelerationAlongAngle } from "../Motion/applyAcceleration.js";
import { findGridAnchoredFloorPropAtCell } from "../Spatial/zones/floorShapes.js";
export const GRID_ROTATABLE_OCCUPANT = { FloorBelt: "floorBelt" };
export function pickRotatableGridOccupantAtWorld(state, worldX, worldY) {
    const grid = state.obstacleGrid;
    const { col, row } = grid.worldToGrid(worldX, worldY);
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
        grid.writeFloorCell(col, row, beltKind, stepCardinalFacing(facingRadians, steps));
        commitGridNavEdit(state, cellBoundsAt(col, row));
        return true;
    }
    throw new Error(`Unknown rotatable grid occupant kind: ${kind}`);
}
export function canStampFloorOccupancyAt(state, col, row) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    if (grid.isBlocked(col, row)) return false;
    if (grid.hasFloorOccupancy(col, row)) return false;
    if (findGridAnchoredFloorPropAtCell(state.worldProps, col, row)) return false;
    return true;
}
export const canStampFloorBeltAt = canStampFloorOccupancyAt;
export const canStampPassagePowerSourceAt = canStampFloorOccupancyAt;
const RAILED_BELT_RAIL_COLORS = { shadow: "#450A0A", mid: "#7F1D1D", highlight: "#991B1B" };
const RAILED_BELT_RAIL_TOP_COLORS = { light: "#EF4444", mid: "#B91C1C", dark: "#7F1D1D" };
const RAILED_BELT_RAIL_STROKE = "#3F0707";
const RAILED_BELT_CHEVRON_COLORS = { fill: "#EF4444", stroke: "#7F1D1D" };
const railDrawOpts = { railColors: RAILED_BELT_RAIL_COLORS, railTopColors: RAILED_BELT_RAIL_TOP_COLORS, railStroke: RAILED_BELT_RAIL_STROKE, chevronColors: RAILED_BELT_CHEVRON_COLORS };
const beltDrawByTurn = { straight: createConveyorDraw(), left: createConveyorDraw({ turnDirection: "left" }), right: createConveyorDraw({ turnDirection: "right" }) };
const beltRailsDrawByTurn = {
    straight: createConveyorDraw(railDrawOpts),
    left: createConveyorDraw({ turnDirection: "left", ...railDrawOpts }),
    right: createConveyorDraw({ turnDirection: "right", ...railDrawOpts }),
};
const passagePowerSourceDraw = (ctx, prop) => {
    const energized = prop._powerSource.energized;
    const cellSize = prop.halfExtents.x * 2;
    const inset = cellSize * 0.22;
    const lineScale = getCanvasLineScale(ctx);
    const half = cellSize * 0.5;
    const left = prop.x - half + inset;
    const top = prop.y - half + inset;
    const size = cellSize - inset * 2;
    ctx.fillStyle = energized ? "rgba(255, 193, 7, 0.35)" : "rgba(120, 53, 15, 0.25)";
    ctx.strokeStyle = energized ? "#FFC107" : "#FF8F00";
    ctx.lineWidth = (energized ? 2.5 : 1.5) * lineScale;
    ctx.beginPath();
    ctx.rect(left, top, size, size);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = energized ? "#FFE082" : "#FFB300";
    fillCircle(ctx, prop.x, prop.y, (energized ? 5 : 4) * lineScale);
    const corner = inset * 0.55;
    const innerHalf = half - inset;
    ctx.fillStyle = energized ? "#FFF59D" : "#FFCA28";
    fillCircle(ctx, prop.x - innerHalf, prop.y - innerHalf, corner * lineScale);
    fillCircle(ctx, prop.x + innerHalf, prop.y - innerHalf, corner * lineScale);
    fillCircle(ctx, prop.x + innerHalf, prop.y + innerHalf, corner * lineScale);
    fillCircle(ctx, prop.x - innerHalf, prop.y + innerHalf, corner * lineScale);
};
function beltDrawForKind(kind) {
    const turn = floorBeltElbowTurn(kind);
    const table = isFloorBeltRailsKind(kind) ? beltRailsDrawByTurn : beltDrawByTurn;
    if (turn === "left") return table.left;
    if (turn === "right") return table.right;
    return table.straight;
}
export function stampFloorBeltsInBounds(grid, minCol, maxCol, minRow, maxRow, facingRadians) {
    let changed = false;
    forEachDenseCellInRect(minCol, maxCol, minRow, maxRow, grid.cols, (col, row) => {
        if (grid.writeFloorBelt(col, row, facingRadians)) changed = true;
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
        const { col, row } = grid.worldToGrid(entity.x, entity.y);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        const idx = col + row * grid.cols;
        if (!grid.floorStore.isBeltKindAtIdx(idx)) continue;
        const kind = grid.floorStore.kind[idx];
        const facingIndex = grid.floorStore.facing[idx];
        const beltAngle = floorBeltFacingFromIndex(facingIndex);
        applyKineticAccelerationAlongAngle(entity, beltAngle, force, dtSec);
    }
}
export function drawFloorOccupancyBelts(ctx, state, viewport, camera) {
    const grid = state.obstacleGrid;
    if (!grid.floorStore.hasAny()) return;
    const cached = syncFloorOccupancyStampDrawCache(state, grid);
    if (!cached?.belts.length) return;
    drawCachedFloorOccupancyBelts(ctx, viewport, camera, state.gameTime, cached, beltDrawForKind);
}
export function drawFloorOccupancyPowerSources(ctx, state, viewport, camera) {
    const grid = state.obstacleGrid;
    if (!grid.cols) return;
    const cached = syncFloorOccupancyStampDrawCache(state, grid);
    if (!cached?.powerSources.length) return;
    drawCachedFloorOccupancyPowerSources(ctx, viewport, camera, cached, (col, row) => isPassagePowerSourceEnergized(state, col, row), passagePowerSourceDraw);
}
export function clearFloorOverlayAt(state, col, row) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    const idx = colRowToIndex(col, row, grid.cols);
    if (grid.floorStore.isPassagePowerSourceAtIdx(idx)) return clearPassagePowerSourceAt(state, col, row);
    if (!grid.clearFloorCell(col, row)) return false;
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
        const { col, row } = grid.worldToGrid(globalCol * cellSize + half, globalRow * cellSize + half);
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
        const { col, row } = grid.worldToGrid(globalCol * cellSize + half, globalRow * cellSize + half);
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
