import { forEachDenseCellInRect } from "../DataStructures/CellRect.js";
import { floorBeltFacingFromIndex, floorBeltElbowTurn } from "../Spatial/grid/FloorCell.js";
import { createConveyorDraw } from "../Render/conveyorDraw.js";
import { DEFAULT_FLOOR_BELT_FORCE } from "./floorBeltDefaults.js";
import { applyPushableAccelerationAlongAngle } from "../Motion/applyAcceleration.js";
const beltDrawByTurn = { straight: createConveyorDraw(), left: createConveyorDraw({ turnDirection: "left" }), right: createConveyorDraw({ turnDirection: "right" }) };
const beltDrawScratch = { x: 0, y: 0, facing: 0, halfExtents: { x: 0, y: 0 }, ageMs: 0 };
/** @param {number} kind */
function beltDrawForKind(kind) {
    const turn = floorBeltElbowTurn(kind);
    if (turn === "left") return beltDrawByTurn.left;
    if (turn === "right") return beltDrawByTurn.right;
    return beltDrawByTurn.straight;
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
