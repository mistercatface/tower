import { CARDINAL_FACING_STEPS } from "../../Math/Angle.js";
import { cellInRect } from "./GridUtils.js";
import { emptyCellBounds, growCellBoundsIdx, isEmptyCellBounds } from "../../DataStructures/CellRect.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch, bumpFloorOccupancyStampDrawRevision } from "./gridNavEpoch.js";
import { tickGridZoneMembership } from "../zones/gridZoneMembership.js";
/** Floor occupancy kinds — walkable cell overlays (belts, pads); not voxelBlock or edgeStore. */
export const FLOOR_CELL_KIND = { None: 0, Belt: 1, BeltElbowLeft: 2, BeltElbowRight: 3 };
const DEFAULT_FLOOR_BELT_FORCE = 500;
/** Structure-of-arrays store for floor occupancy (belt kind + cardinal facing) per cell. */
export class FloorCellStore {
    constructor() {
        this.kind = new Uint8Array(0);
        this.facing = new Uint8Array(0);
    }
    reset(cellCount) {
        this.kind = new Uint8Array(cellCount);
        this.facing = new Uint8Array(cellCount);
    }
    remap(oldKind, oldFacing, oldCols, oldRows, colOffset, rowOffset, newCols, newRows) {
        const newKind = new Uint8Array(newCols * newRows);
        const newFacing = new Uint8Array(newCols * newRows);
        const oldSize = oldCols * oldRows;
        for (let idx = 0; idx < oldSize; idx++) {
            if (oldKind[idx] === FLOOR_CELL_KIND.None) continue;
            const row = (idx / oldCols) | 0;
            const col = idx - row * oldCols;
            const nc = col + colOffset;
            const nr = row + rowOffset;
            if (!cellInRect(nc, nr, newCols, newRows)) continue;
            const newIdx = nc + nr * newCols;
            newKind[newIdx] = oldKind[idx];
            newFacing[newIdx] = oldFacing[idx];
        }
        this.kind = newKind;
        this.facing = newFacing;
    }
    hasAnyAtIdx(idx) {
        return this.kind[idx] !== FLOOR_CELL_KIND.None;
    }
    setAtIdx(idx, kind, facingIndex) {
        this.kind[idx] = kind;
        this.facing[idx] = facingIndex;
    }
    clearAtIdx(idx) {
        this.kind[idx] = FLOOR_CELL_KIND.None;
        this.facing[idx] = 0;
    }
    hasAny() {
        const size = this.kind.length;
        for (let idx = 0; idx < size; idx++) if (this.kind[idx] !== FLOOR_CELL_KIND.None) return true;
        return false;
    }
}
/** Neighbor cell side index 0=N,1=E,2=S,3=W from `(c,r)` toward `(nc,nr)`. */
export function gridSideFromCellToNeighbor(c, r, nc, nr) {
    const dc = nc - c;
    const dr = nr - r;
    if (dc === 1 && dr === 0) return 1;
    if (dc === -1 && dr === 0) return 3;
    if (dc === 0 && dr === 1) return 2;
    if (dc === 0 && dr === -1) return 0;
    throw new Error(`gridSideFromCellToNeighbor: non-cardinal step ${dc},${dr}`);
}
/** Neighbor cell side index 0=N,1=E,2=S,3=W from `idx` toward `nIdx`. */
export function gridSideFromCellIdxToNeighborIdx(idx, nIdx, cols) {
    const diff = nIdx - idx;
    if (diff === 1) return 1;
    if (diff === -1) return 3;
    if (diff === cols) return 2;
    if (diff === -cols) return 0;
    return -1;
}
export class FloorBelt {
    static get KIND() {
        return FLOOR_CELL_KIND;
    }
    static isBelt(kind) {
        return kind >= FLOOR_CELL_KIND.Belt && kind <= FLOOR_CELL_KIND.BeltElbowRight;
    }
    static getElbowTurn(kind) {
        if (kind === FLOOR_CELL_KIND.BeltElbowLeft) return "left";
        if (kind === FLOOR_CELL_KIND.BeltElbowRight) return "right";
        return null;
    }
    static getEntryExitSides(kind, facingIndex) {
        const exitSide = (facingIndex + 1) % 4;
        let entrySide;
        if (kind === FLOOR_CELL_KIND.BeltElbowLeft) entrySide = (exitSide + 1) % 4;
        else if (kind === FLOOR_CELL_KIND.BeltElbowRight) entrySide = (exitSide + 3) % 4;
        else entrySide = (exitSide + 2) % 4;
        return { entrySide, exitSide };
    }
    static getRailEdgeSides(kind, facingIndex) {
        const { entrySide, exitSide } = FloorBelt.getEntryExitSides(kind, facingIndex);
        const sides = [];
        for (let side = 0; side < 4; side++) if (side !== entrySide && side !== exitSide) sides.push(side);
        return sides;
    }
    static formatKindLabel(kind) {
        const labels = { [FLOOR_CELL_KIND.Belt]: "Conveyor", [FLOOR_CELL_KIND.BeltElbowLeft]: "Conveyor Elbow L", [FLOOR_CELL_KIND.BeltElbowRight]: "Conveyor Elbow R" };
        return labels[kind] ?? "Belt";
    }
    static formatFacingLabel(facingIndex) {
        const labels = ["E", "S", "W", "N"];
        return labels[facingIndex % CARDINAL_FACING_STEPS];
    }
    static resolveKindFromSides(entrySide, exitSide) {
        const facingIndex = (exitSide + 3) % 4;
        let kind = FLOOR_CELL_KIND.Belt;
        if (entrySide === (exitSide + 1) % 4) kind = FLOOR_CELL_KIND.BeltElbowLeft;
        else if (entrySide === (exitSide + 3) % 4) kind = FLOOR_CELL_KIND.BeltElbowRight;
        return { kind, facingIndex };
    }
    static getFacingAngle(facingIndex) {
        return (facingIndex % CARDINAL_FACING_STEPS) * ((Math.PI * 2) / CARDINAL_FACING_STEPS);
    }
    static getEntryEdgeWorldPoint(grid, idx, entrySide) {
        const x = grid.gridCenterXByIdx(idx);
        const y = grid.gridCenterYByIdx(idx);
        const inset = grid.cellSize * 0.35;
        if (entrySide === 0) return { x, y: y - inset };
        if (entrySide === 1) return { x: x + inset, y };
        if (entrySide === 2) return { x, y: y + inset };
        return { x: x - inset, y };
    }
    static getEntryExitAtIdx(grid, idx) {
        if (idx < 0 || idx >= grid.cols * grid.rows) return null;
        const kind = grid.floorStore.kind[idx];
        if (!FloorBelt.isBelt(kind)) return null;
        return FloorBelt.getEntryExitSides(kind, grid.floorStore.facing[idx]);
    }
    static isBeltAtIdx(grid, idx) {
        if (idx < 0 || idx >= grid.cols * grid.rows) return false;
        return grid.floorStore.hasAnyAtIdx(idx);
    }
    static isEntityOnBelt(grid, x, y) {
        const col = grid.worldCol(x);
        const row = grid.worldRow(y);
        return FloorBelt.isBeltAtIdx(grid, col + row * grid.cols);
    }
    static pickRotatableOccupantAtWorld(state, worldX, worldY) {
        const grid = state.obstacleGrid;
        const col = grid.worldCol(worldX);
        const row = grid.worldRow(worldY);
        if (!cellInRect(col, row, grid.cols, grid.rows)) return -1;
        const idx = col + row * grid.cols;
        if (grid.floorStore.hasAnyAtIdx(idx)) return idx;
        return -1;
    }
    static rotateOccupantAt(state, occupant, steps = 1, onCommit = null) {
        const grid = state.obstacleGrid;
        const idx = typeof occupant === "number" ? occupant : occupant.col + occupant.row * grid.cols;
        if (!grid.floorStore.hasAnyAtIdx(idx)) return false;
        const beltKind = grid.floorStore.kind[idx];
        const facingIndex = (((grid.floorStore.facing[idx] + steps) % 4) + 4) % 4;
        grid.writeFloorCell(idx, beltKind, facingIndex);
        if (onCommit) onCommit(state, idx);
        return true;
    }
    static canStampAt(state, idx, findPropAtCell = null) {
        const grid = state.obstacleGrid;
        if (idx < 0 || idx >= grid.cols * grid.rows) return false;
        const r = (idx / grid.cols) | 0;
        const c = idx - r * grid.cols;
        if (grid.isBlockedIdx(idx)) return false;
        if (grid.hasFloorOccupancy(idx)) return false;
        if (findPropAtCell && findPropAtCell(state.worldProps, c, r)) return false;
        return true;
    }
    static clearOverlayAt(state, idx) {
        const grid = state.obstacleGrid;
        if (idx < 0 || idx >= grid.cols * grid.rows) return false;
        if (!grid.clearFloorCell(idx)) return false;
        FloorBelt.markZoneSubscriptionsDirty(state);
        return true;
    }
    static listPlacedForSnapshot(grid) {
        const items = [];
        const size = grid.cols * grid.rows;
        const cellSize = grid.cellSize;
        for (let idx = 0; idx < size; idx++) {
            if (!grid.floorStore.hasAnyAtIdx(idx)) continue;
            const col = idx % grid.cols;
            const row = (idx / grid.cols) | 0;
            const globalCol = Math.floor((grid.minX + col * cellSize) / cellSize);
            const globalRow = Math.floor((grid.minY + row * cellSize) / cellSize);
            items.push({ col: globalCol, row: globalRow, kind: grid.floorStore.kind[idx], facingIndex: grid.floorStore.facing[idx] });
        }
        return items;
    }
    static applyFromGlobal(state, floorBelts, cellSize) {
        const grid = state.obstacleGrid;
        const half = grid.cellHalfSize;
        const bounds = emptyCellBounds();
        let floorNavChanged = false;
        for (let i = 0; i < floorBelts.length; i++) {
            const { col: globalCol, row: globalRow, kind, facingIndex } = floorBelts[i];
            if (!FloorBelt.isBelt(kind)) throw new Error(`Invalid floor belt kind: ${kind}`);
            const idx = grid.worldToIdx(globalCol * cellSize + half, globalRow * cellSize + half);
            if (idx < 0 || idx >= grid.cols * grid.rows) continue;
            const prevKind = grid.floorStore.kind[idx];
            const prevFacing = grid.floorStore.facing[idx];
            const facing = ((facingIndex % 4) + 4) % 4;
            if (prevKind !== kind || prevFacing !== facing) floorNavChanged = true;
            grid.floorStore.setAtIdx(idx, kind, facing);
            growCellBoundsIdx(bounds, idx, grid.cols);
        }
        if (floorNavChanged) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Floor);
        if (isEmptyCellBounds(bounds)) return null;
        FloorBelt.markZoneSubscriptionsDirty(state);
        bumpFloorOccupancyStampDrawRevision(grid);
        return bounds;
    }
    static markZoneSubscriptionsDirty(state) {
        state.sandbox.gridZoneSubscriptionsDirty = true;
    }
    static buildZoneSubscriptions(grid) {
        const cells = new Set();
        if (!grid.cols) return { cells };
        const size = grid.cols * grid.rows;
        for (let idx = 0; idx < size; idx++) if (grid.floorStore.hasAnyAtIdx(idx)) cells.add(idx);
        return { cells };
    }
    static ensureZoneSubscriptions(state) {
        if (!state.sandbox.gridZoneSubscriptionsDirty && state.sandbox.gridZoneSubscriptions) return state.sandbox.gridZoneSubscriptions;
        state.sandbox.gridZoneSubscriptions = FloorBelt.buildZoneSubscriptions(state.obstacleGrid);
        state.sandbox.gridZoneSubscriptionsDirty = false;
        return state.sandbox.gridZoneSubscriptions;
    }
    static onCellZoneEvent(state, event, phase) {
        if (phase === "on") return;
        if (!state.sandbox.beltZoneEvents) state.sandbox.beltZoneEvents = [];
        state.sandbox.beltZoneEvents.push({ at: state.gameTime, phase, idx: event.idx, entityId: event.entity.id });
        if (state.sandbox.beltZoneEvents.length > 32) state.sandbox.beltZoneEvents.shift();
    }
    static tickZones(state, spatialFrame) {
        const subscriptions = FloorBelt.ensureZoneSubscriptions(state);
        if (!subscriptions.cells.size) return;
        tickGridZoneMembership(spatialFrame, state.obstacleGrid, subscriptions, {
            onEnter(event) {
                FloorBelt.onCellZoneEvent(state, event, "enter");
            },
            onOn(event) {
                FloorBelt.onCellZoneEvent(state, event, "on");
            },
            onExit(event) {
                FloorBelt.onCellZoneEvent(state, event, "exit");
            },
        });
    }
    static tickOccupancy(state, spatialFrame, dt, applyAcceleration = null) {
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
            const cx = grid.gridCenterXByIdx(idx);
            const cy = grid.gridCenterYByIdx(idx);
            let ax = 0,
                ay = 0;
            if (kind === FLOOR_CELL_KIND.Belt) {
                const beltAngle = FloorBelt.getFacingAngle(facingIndex);
                const flowX = Math.cos(beltAngle);
                const flowY = Math.sin(beltAngle);
                const normalX = -flowY;
                const normalY = flowX;
                const dispX = cx - entity.x;
                const dispY = cy - entity.y;
                const lateralOffset = dispX * normalX + dispY * normalY;
                const lateralForceMagnitude = (lateralOffset / grid.cellHalfSize) * force * 1.5;
                const v_lateral = (entity.vx || 0) * normalX + (entity.vy || 0) * normalY;
                const lateralDamping = -v_lateral * 5.0;
                ax = flowX * force + normalX * (lateralForceMagnitude + lateralDamping);
                ay = flowY * force + normalY * (lateralForceMagnitude + lateralDamping);
            } else {
                const { entrySide, exitSide } = FloorBelt.getEntryExitSides(kind, facingIndex);
                const DIR_X = [0, 1, 0, -1];
                const DIR_Y = [-1, 0, 1, 0];
                const pDx = DIR_X[entrySide] + DIR_X[exitSide];
                const pDy = DIR_Y[entrySide] + DIR_Y[exitSide];
                const pivotX = cx + pDx * grid.cellHalfSize;
                const pivotY = cy + pDy * grid.cellHalfSize;
                const dx = entity.x - pivotX;
                const dy = entity.y - pivotY;
                const dist = Math.hypot(dx, dy);
                const turn = FloorBelt.getElbowTurn(kind);
                const isLeft = turn === "left";
                let rX = 0,
                    rY = 0,
                    tX = 0,
                    tY = 0;
                if (dist > 0.001) {
                    rX = dx / dist;
                    rY = dy / dist;
                    tX = isLeft ? -rY : rY;
                    tY = isLeft ? rX : -rX;
                } else {
                    const angle = FloorBelt.getFacingAngle(facingIndex);
                    tX = Math.cos(angle);
                    tY = Math.sin(angle);
                }
                const diff = dist - grid.cellHalfSize;
                const springForce = -(diff / (grid.cellHalfSize * 0.5)) * force * 1.5;
                const v_radial = (entity.vx || 0) * rX + (entity.vy || 0) * rY;
                const damping = -v_radial * 5.0;
                ax = tX * force + rX * (springForce + damping);
                ay = tY * force + rY * (springForce + damping);
            }
            if (applyAcceleration) applyAcceleration(entity, ax, ay, dtSec);
        }
    }
}
