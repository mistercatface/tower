import { emptyCellBounds, growCellBounds, isEmptyCellBounds } from "../DataStructures/CellRect.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch, bumpFloorOccupancyStampDrawRevision } from "../Spatial/grid/gridNavEpoch.js";
import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { floorBeltFacingFromIndex, isFloorBeltKind, floorBeltEntryExitSides, floorBeltElbowTurn, FLOOR_CELL_KIND } from "../Spatial/grid/FloorCell.js";
import { cellToGlobalColRow } from "../Spatial/grid/gridCellTopology.js";
import { DEFAULT_FLOOR_BELT_FORCE } from "./floorBeltDefaults.js";
import { commitGridNavEdit } from "./gridNavEdit.js";
import { applyKineticAccelerationAlongAngle, applyKineticAcceleration } from "../Motion/motionDynamics.js";
import { findGridAnchoredFloorPropAtCell } from "../Spatial/zones/floorShapes.js";
import { tickGridZoneMembership } from "../Spatial/zones/gridZoneMembership.js";
/** @typedef {import("../Spatial/zones/gridZoneMembership.js").GridZoneSubscriptions} GridZoneSubscriptions */
/** @typedef {import("../Spatial/zones/gridZoneMembership.js").GridZoneEvent} GridZoneEvent */
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
export function canStampFloorBeltAt(state, idx) {
    const grid = state.obstacleGrid;
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
        const { entrySide, exitSide } = floorBeltEntryExitSides(kind, facingIndex);
        const cx = grid.gridCenterXByIdx(idx);
        const cy = grid.gridCenterYByIdx(idx);
        let ax = 0,
            ay = 0;
        if (kind === FLOOR_CELL_KIND.Belt) {
            const beltAngle = floorBeltFacingFromIndex(facingIndex);
            ax = Math.cos(beltAngle) * force;
            ay = Math.sin(beltAngle) * force;
            if (facingIndex % 2 === 0) {
                // E or W, center Y
                const dy = cy - entity.y;
                ay += (dy / grid.cellHalfSize) * force * 1.5;
                if (entity.vy) ay -= entity.vy * 5.0; // Damp lateral velocity
            } else {
                // S or N, center X
                const dx = cx - entity.x;
                ax += (dx / grid.cellHalfSize) * force * 1.5;
                if (entity.vx) ax -= entity.vx * 5.0; // Damp lateral velocity
            }
        } else {
            const getSideDx = (s) => (s === 1 ? 1 : s === 3 ? -1 : 0);
            const getSideDy = (s) => (s === 2 ? 1 : s === 0 ? -1 : 0);
            const pDx = getSideDx(entrySide) + getSideDx(exitSide);
            const pDy = getSideDy(entrySide) + getSideDy(exitSide);
            const pivotX = cx + pDx * grid.cellHalfSize;
            const pivotY = cy + pDy * grid.cellHalfSize;
            const idealRadius = grid.cellHalfSize;
            const dx = entity.x - pivotX;
            const dy = entity.y - pivotY;
            const dist = Math.hypot(dx, dy);
            const turn = floorBeltElbowTurn(kind);
            let tX, tY;
            if (turn === "left") {
                tX = -dy;
                tY = dx;
            } else {
                tX = dy;
                tY = -dx;
            }
            const tLen = Math.hypot(tX, tY);
            if (tLen > 0.001) {
                tX /= tLen;
                tY /= tLen;
            } else {
                const beltAngle = floorBeltFacingFromIndex(facingIndex);
                tX = Math.cos(beltAngle);
                tY = Math.sin(beltAngle);
            }
            const diff = dist - idealRadius;
            let rX = dx;
            let rY = dy;
            if (dist > 0.001) {
                rX /= dist;
                rY /= dist;
            }
            // Proportional spring force toward ideal radius
            const diffRatio = diff / (grid.cellHalfSize * 0.5);
            const springForce = -diffRatio * force * 1.5;
            // Damping radial velocity
            const v_r = (entity.vx || 0) * rX + (entity.vy || 0) * rY;
            const dampingX = -rX * v_r * 5.0;
            const dampingY = -rY * v_r * 5.0;
            ax = tX * force + rX * springForce + dampingX;
            ay = tY * force + rY * springForce + dampingY;
        }
        applyKineticAcceleration(entity, ax, ay, dtSec);
    }
}
export function clearFloorOverlayAt(state, idx) {
    const grid = state.obstacleGrid;
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
export function markGridZoneSubscriptionsDirty(state) {
    state.sandbox.gridZoneSubscriptionsDirty = true;
}
export function buildGridZoneSubscriptions(grid) {
    /** @type {Set<number>} */
    const cells = new Set();
    if (!grid.cols) return { cells };
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) if (grid.floorStore.hasAnyAtIdx(idx)) cells.add(idx);
    return { cells };
}
function ensureGridZoneSubscriptions(state) {
    if (!state.sandbox.gridZoneSubscriptionsDirty && state.sandbox.gridZoneSubscriptions) return state.sandbox.gridZoneSubscriptions;
    state.sandbox.gridZoneSubscriptions = buildGridZoneSubscriptions(state.obstacleGrid);
    state.sandbox.gridZoneSubscriptionsDirty = false;
    return state.sandbox.gridZoneSubscriptions;
}
function onBeltCellZoneEvent(state, event, phase) {
    if (phase === "on") return;
    state.sandbox.beltZoneEvents.push({ at: state.gameTime, phase, idx: event.idx, entityId: event.entity.id });
    if (state.sandbox.beltZoneEvents.length > 32) state.sandbox.beltZoneEvents.shift();
}
export function tickGridZones(state, spatialFrame) {
    const subscriptions = ensureGridZoneSubscriptions(state);
    if (!subscriptions.cells.size) return;
    tickGridZoneMembership(spatialFrame, state.obstacleGrid, subscriptions, {
        onEnter(event) {
            onBeltCellZoneEvent(state, event, "enter");
        },
        onOn(event) {
            onBeltCellZoneEvent(state, event, "on");
        },
        onExit(event) {
            onBeltCellZoneEvent(state, event, "exit");
        },
    });
}
