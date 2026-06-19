import { cellChebyshevDistance } from "../../Navigation/steering/exploreSteering.js";
import { isFloorBeltCell } from "../../Spatial/grid/FloorCell.js";
/**
 * Belt destinations require the body center on the belt cell — snapping stops one tile
 * upstream at the entry mouth, so Chebyshev ≤ 1 would repick before the snake mounts.
 */
export function snakeHasArrivedAtDestCell(grid, seekerCol, seekerRow, destCol, destRow) {
    if (isFloorBeltCell(grid, destCol, destRow)) return seekerCol === destCol && seekerRow === destRow;
    return cellChebyshevDistance(seekerCol, seekerRow, destCol, destRow) <= 1;
}
