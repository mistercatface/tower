import { forEachDenseCellInRect } from "../DataStructures/CellRect.js";
import { floorBeltFacingFromIndex, floorBeltElbowTurn, isFloorBeltRailsKind } from "../Spatial/grid/FloorCell.js";
import { createConveyorDraw } from "../Render/conveyorDraw.js";
import { DEFAULT_FLOOR_BELT_FORCE } from "./floorBeltDefaults.js";
import { applyPushableAccelerationAlongAngle } from "../Motion/applyAcceleration.js";
import { findGridAnchoredFloorPropAtCell } from "../Spatial/zones/floorShapes.js";
/** @param {object} state @param {number} col @param {number} row */
export function canStampFloorBeltAt(state, col, row) {
    const grid = state.obstacleGrid;
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return false;
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
const beltDrawScratch = { x: 0, y: 0, facing: 0, halfExtents: { x: 0, y: 0 }, ageMs: 0 };
/** @param {number} kind */
function beltDrawForKind(kind) {
    const turn = floorBeltElbowTurn(kind);
    const table = isFloorBeltRailsKind(kind) ? beltRailsDrawByTurn : beltDrawByTurn;
    if (turn === "left") return table.left;
    if (turn === "right") return table.right;
    return table.straight;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} minCol @param {number} maxCol @param {number} minRow @param {number} maxRow @param {number} facingRadians */
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
        if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) continue;
        const idx = col + row * grid.cols;
        if (!grid.floorStore.isBeltKindAtIdx(idx)) continue;
        applyPushableAccelerationAlongAngle(entity, floorBeltFacingFromIndex(grid.floorStore.facing[idx]), force, dtSec);
    }
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 * @param {{ px: number, py: number }} camera
 */
export function drawFloorOccupancyBelts(ctx, state, viewport, camera) {
    const grid = state.obstacleGrid;
    if (!grid.floorStore.hasAny()) return;
    const bounds = viewport.boundsVisibleDefault;
    const minCol = Math.max(0, grid.worldToGrid(bounds.minX, bounds.minY).col);
    const maxCol = Math.min(grid.cols - 1, grid.worldToGrid(bounds.maxX, bounds.maxY).col);
    const minRow = Math.max(0, grid.worldToGrid(bounds.minX, bounds.minY).row);
    const maxRow = Math.min(grid.rows - 1, grid.worldToGrid(bounds.maxX, bounds.maxY).row);
    const cellHalf = grid.cellSize * 0.5;
    beltDrawScratch.halfExtents.x = cellHalf;
    beltDrawScratch.halfExtents.y = cellHalf;
    beltDrawScratch.ageMs = state.gameTime;
    const { px, py } = camera;
    forEachDenseCellInRect(minCol, maxCol, minRow, maxRow, grid.cols, (col, row, idx) => {
        const kind = grid.floorStore.kind[idx];
        if (!grid.floorStore.isBeltKindAtIdx(idx)) return;
        const { x, y } = grid.gridToWorld(col, row);
        beltDrawScratch.x = x;
        beltDrawScratch.y = y;
        beltDrawScratch.facing = floorBeltFacingFromIndex(grid.floorStore.facing[idx]);
        beltDrawForKind(kind)(ctx, beltDrawScratch, px, py);
    });
}
