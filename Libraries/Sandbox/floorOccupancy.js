import { emptyCellBounds, growCellBounds, isEmptyCellBounds, forEachDenseCellInRect } from "../DataStructures/CellRect.js";
import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { floorBeltFacingFromIndex, floorBeltElbowTurn, isFloorBeltKind, isFloorBeltRailsKind } from "../Spatial/grid/FloorCell.js";
import { stepCardinalFacing } from "../Math/Angle.js";
import { gridCellToGlobalColRow } from "../Spatial/grid/gridCellTopology.js";
import { fillCircle } from "../Canvas/CanvasPath.js";
import { drawCachedPropSprite, GRID_STAMP_RENDER_KEY } from "../Canvas/QuantizedSpriteCache.js";
import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { createConveyorDraw } from "../Render/conveyorDraw.js";
import { DEFAULT_FLOOR_BELT_FORCE } from "./floorBeltDefaults.js";
import { markGridZoneSubscriptionsDirty } from "./gridZoneTick.js";
import { syncPassagePowerNetwork, isPassagePowerSourceEnergized } from "./passagePowerNetwork.js";
import { applyPushableAccelerationAlongAngle } from "../Motion/applyAcceleration.js";
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
        markGridZoneSubscriptionsDirty(state);
        return true;
    }
    throw new Error(`Unknown rotatable grid occupant kind: ${kind}`);
}
export function canStampFloorBeltAt(state, col, row) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    if (grid.isBlocked(col, row)) return false;
    if (grid.hasFloorOccupancy(col, row)) return false;
    if (findGridAnchoredFloorPropAtCell(state.entityRegistry, col, row)) return false;
    return true;
}
const RAILED_BELT_RAIL_COLORS = { shadow: "#92400E", mid: "#D97706", highlight: "#FBBF24" };
const RAILED_BELT_RAIL_TOP_COLORS = { light: "#FDE68A", mid: "#F59E0B", dark: "#B45309" };
const RAILED_BELT_RAIL_STROKE = "#78350F";
const railDrawOpts = { railColors: RAILED_BELT_RAIL_COLORS, railTopColors: RAILED_BELT_RAIL_TOP_COLORS, railStroke: RAILED_BELT_RAIL_STROKE };
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
/** Cell lookup + acceleration once per frame before pushable physics substeps. */
export function tickFloorOccupancy(state, spatialFrame, dt) {
    const grid = state.obstacleGrid;
    if (!grid.floorStore.hasAny()) return;
    const pushables = spatialFrame._pushables;
    if (!pushables?.length) return;
    const dtSec = dt / 1000;
    const force = DEFAULT_FLOOR_BELT_FORCE;
    for (let i = 0; i < pushables.length; i++) {
        const entity = pushables[i];
        const { col, row } = grid.worldToGrid(entity.x, entity.y);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        const idx = col + row * grid.cols;
        if (!grid.floorStore.isBeltKindAtIdx(idx)) continue;
        const kind = grid.floorStore.kind[idx];
        const facingIndex = grid.floorStore.facing[idx];
        const beltAngle = floorBeltFacingFromIndex(facingIndex);
        applyPushableAccelerationAlongAngle(entity, beltAngle, force, dtSec);
    }
}
export function drawFloorOccupancyBelts(ctx, state, viewport, camera) {
    const grid = state.obstacleGrid;
    if (!grid.floorStore.hasAny()) return;
    const bounds = viewport.boundsVisibleDefault;
    const minCol = Math.max(0, grid.worldToGrid(bounds.minX, bounds.minY).col);
    const maxCol = Math.min(grid.cols - 1, grid.worldToGrid(bounds.maxX, bounds.maxY).col);
    const minRow = Math.max(0, grid.worldToGrid(bounds.minX, bounds.minY).row);
    const maxRow = Math.min(grid.rows - 1, grid.worldToGrid(bounds.maxX, bounds.maxY).row);
    const cellHalf = grid.cellHalfSize;
    const { px, py } = camera;
    forEachDenseCellInRect(minCol, maxCol, minRow, maxRow, grid.cols, (col, row, idx) => {
        const kind = grid.floorStore.kind[idx];
        if (!grid.floorStore.isBeltKindAtIdx(idx)) return;
        const { x, y } = grid.gridToWorld(col, row);
        const facing = floorBeltFacingFromIndex(grid.floorStore.facing[idx]);
        const animFrame = Math.floor(state.gameTime / 60) % 8;
        const proxy = {
            x,
            y,
            facing,
            radius: cellHalf,
            halfExtents: { x: cellHalf, y: cellHalf },
            ageMs: state.gameTime,
            getCustomSpriteCacheKey() {
                return `k${kind}`;
            },
        };
        drawCachedPropSprite(ctx, proxy, px, py, GRID_STAMP_RENDER_KEY.FloorBelt, beltDrawForKind(kind), { animFrame });
    });
}
export function drawFloorOccupancyPowerSources(ctx, state, viewport, camera) {
    const grid = state.obstacleGrid;
    if (!grid.cols) return;
    const bounds = viewport.boundsVisibleDefault;
    const minCol = Math.max(0, grid.worldToGrid(bounds.minX, bounds.minY).col);
    const maxCol = Math.min(grid.cols - 1, grid.worldToGrid(bounds.maxX, bounds.maxY).col);
    const minRow = Math.max(0, grid.worldToGrid(bounds.minX, bounds.minY).row);
    const maxRow = Math.min(grid.rows - 1, grid.worldToGrid(bounds.maxX, bounds.maxY).row);
    const cellHalf = grid.cellHalfSize;
    const { px, py } = camera;
    forEachDenseCellInRect(minCol, maxCol, minRow, maxRow, grid.cols, (col, row, idx) => {
        if (!grid.floorStore.isPassagePowerSourceAtIdx(idx)) return;
        const { x, y } = grid.gridToWorld(col, row);
        const energized = isPassagePowerSourceEnergized(state, col, row);
        const proxy = {
            x,
            y,
            facing: 0,
            radius: cellHalf,
            halfExtents: { x: cellHalf, y: cellHalf },
            _powerSource: { energized },
            getCustomSpriteCacheKey() {
                return energized ? "on" : "off";
            },
        };
        drawCachedPropSprite(ctx, proxy, px, py, GRID_STAMP_RENDER_KEY.PassagePowerSource, passagePowerSourceDraw);
    });
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
export function listPlacedFloorBeltsForSnapshot(grid) {
    /** @type {{ col: number, row: number, kind: number, facingIndex: number }[]} */
    const belts = [];
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        if (!grid.floorStore.isBeltKindAtIdx(idx)) continue;
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
        belts.push({ col: globalCol, row: globalRow, kind: grid.floorStore.kind[idx], facingIndex: grid.floorStore.facing[idx] });
    }
    return belts;
}
export function applyFloorBeltsFromGlobal(state, floorBelts, cellSize) {
    const grid = state.obstacleGrid;
    const half = grid.cellHalfSize;
    let edgeChanged = false;
    const bounds = emptyCellBounds();
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
        grid.floorStore.setAtIdx(idx, kind, facing);
        if (isFloorBeltRailsKind(prevKind) || isFloorBeltRailsKind(kind)) edgeChanged = true;
        if (isFloorBeltRailsKind(kind)) grid.syncFloorBeltRailEdges(col, row, kind, facing);
        growCellBounds(bounds, col, row);
    }
    if (edgeChanged) grid.bumpWallGridRevision();
    if (isEmptyCellBounds(bounds)) return null;
    markGridZoneSubscriptionsDirty(state);
    return bounds;
}
export function canStampPassagePowerSourceAt(state, col, row) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    if (grid.isBlocked(col, row)) return false;
    if (grid.hasFloorOccupancy(col, row)) return false;
    if (findGridAnchoredFloorPropAtCell(state.entityRegistry, col, row)) return false;
    return true;
}
export function stampPassagePowerSourceAt(state, col, row, defaultPowered = false) {
    if (!canStampPassagePowerSourceAt(state, col, row)) return false;
    const idx = colRowToIndex(col, row, state.obstacleGrid.cols);
    state.obstacleGrid.floorStore.setPassagePowerSourceAtIdx(idx, defaultPowered);
    syncPassagePowerNetwork(state);
    return true;
}
export function clearPassagePowerSourceAt(state, col, row) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    const idx = colRowToIndex(col, row, grid.cols);
    if (!grid.floorStore.isPassagePowerSourceAtIdx(idx)) return false;
    grid.floorStore.clearAtIdx(idx);
    syncPassagePowerNetwork(state);
    return true;
}
export function listPlacedPassagePowerSourcesForSnapshot(grid) {
    /** @type {{ col: number, row: number, defaultPowered?: boolean }[]} */
    const sources = [];
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        if (!grid.floorStore.isPassagePowerSourceAtIdx(idx)) continue;
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
        const entry = { col: globalCol, row: globalRow };
        if (grid.floorStore.passagePowerSourceDefaultPoweredAtIdx(idx)) entry.defaultPowered = true;
        sources.push(entry);
    }
    return sources;
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
    return bounds;
}
