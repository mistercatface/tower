import { createAabb } from "../../Math/Aabb2D.js";
import { CARDINAL_FACING_STEPS, quantizeAngleIndex } from "../../Math/Angle.js";
import { cellBoundsAtOriginInto } from "./GridCoords.js";
import { voidEntityRadius } from "../zones/pit.js";
/** Local cell edge bits — aligned with prop `facing` (rear = −forward). */
export const CELL_EDGE_REAR = 1;
export const CELL_EDGE_FORWARD = 2;
export const CELL_EDGE_LEFT = 4;
export const CELL_EDGE_RIGHT = 8;
/** Straight belt: block both lateral sides; entrance (rear) and exit (forward) open. */
export const CELL_EDGE_LATERAL = CELL_EDGE_LEFT | CELL_EDGE_RIGHT;
/** Elbow L at default facing: block outer (forward) + inner cheek (left); west mouth + south exit open. */
export const CELL_EDGE_ELBOW_LEFT = CELL_EDGE_FORWARD | CELL_EDGE_LEFT;
/** Elbow R: block outer (forward) + inner cheek (right). */
export const CELL_EDGE_ELBOW_RIGHT = CELL_EDGE_FORWARD | CELL_EDGE_RIGHT;
const LOCAL_EDGE_BITS = [CELL_EDGE_REAR, CELL_EDGE_FORWARD, CELL_EDGE_LEFT, CELL_EDGE_RIGHT];
const LOCAL_EDGE_NAMES = ["rear", "forward", "left", "right"];
/** @type {("west" | "east" | "north" | "south")[][]} cardinal facing index → [rear, forward, left, right] */
const LOCAL_EDGE_TO_WORLD = [
    ["west", "east", "north", "south"],
    ["north", "south", "west", "east"],
    ["east", "west", "south", "north"],
    ["south", "north", "east", "west"],
];
const cellBoundsScratch = createAabb();
/** @param {number} mask @param {number} quarterTurns */
export function rotateCellEdgeMask(mask, quarterTurns) {
    const steps = ((quarterTurns % 4) + 4) % 4;
    if (!steps) return mask;
    let out = 0;
    for (let i = 0; i < 4; i++) if (mask & (1 << i)) out |= 1 << ((i + steps) % 4);
    return out;
}
/** @param {object} prop */
export function readCellEdgeBarrierMask(prop) {
    return prop.strategy?.cellEdgeBarrier ?? 0;
}
/**
 * Exact obstacle-grid cell bounds for a grid-anchored prop — min corner + cellSize, no prop-center math.
 *
 * @param {object} prop
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 */
export function getGridCellBoundsForProp(prop, obstacleGrid) {
    let { gridCol: col, gridRow: row } = prop;
    if (col == null || row == null) {
        const gridPos = obstacleGrid.worldToGrid(prop.x, prop.y);
        col = gridPos.col;
        row = gridPos.row;
    }
    return cellBoundsAtOriginInto(cellBoundsScratch, obstacleGrid.minX, obstacleGrid.minY, col, row, obstacleGrid.cellSize);
}
/** @param {number} facingIndex @param {number} localMask */
function blockedWorldEdges(facingIndex, localMask) {
    const edgeMap = LOCAL_EDGE_TO_WORLD[facingIndex];
    /** @type {Record<"west" | "east" | "north" | "south", boolean>} */
    const blocked = { west: false, east: false, north: false, south: false };
    for (let i = 0; i < 4; i++) if (localMask & LOCAL_EDGE_BITS[i]) blocked[edgeMap[i]] = true;
    return blocked;
}
/**
 * @param {import("../../Math/Aabb2D.js").Aabb2D} cell
 * @param {"west" | "east" | "north" | "south"} edge
 */
function worldEdgeLine(cell, edge) {
    if (edge === "west") return { x0: cell.minX, y0: cell.minY, x1: cell.minX, y1: cell.maxY };
    if (edge === "east") return { x0: cell.maxX, y0: cell.minY, x1: cell.maxX, y1: cell.maxY };
    if (edge === "north") return { x0: cell.minX, y0: cell.minY, x1: cell.maxX, y1: cell.minY };
    return { x0: cell.minX, y0: cell.maxY, x1: cell.maxX, y1: cell.maxY };
}
/**
 * @param {object} prop
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 */
export function getCellEdgeBarrierDebugOverlay(prop, obstacleGrid) {
    const mask = readCellEdgeBarrierMask(prop);
    const cell = getGridCellBoundsForProp(prop, obstacleGrid);
    const facingIndex = quantizeAngleIndex(prop.facing ?? 0, CARDINAL_FACING_STEPS);
    const edgeMap = LOCAL_EDGE_TO_WORLD[facingIndex];
    /** @type {{ x0: number, y0: number, x1: number, y1: number, blocked: boolean, role: string }[]} */
    const edges = [];
    for (let i = 0; i < 4; i++) {
        const worldEdge = edgeMap[i];
        edges.push({ ...worldEdgeLine(cell, worldEdge), blocked: (mask & LOCAL_EDGE_BITS[i]) !== 0, role: LOCAL_EDGE_NAMES[i] });
    }
    return { cell: { minX: cell.minX, minY: cell.minY, maxX: cell.maxX, maxY: cell.maxY }, edges };
}
/** @param {object} entity */
function entityWorldAabb(entity) {
    if (entity.halfExtents) return { minX: entity.x - entity.halfExtents.x, minY: entity.y - entity.halfExtents.y, maxX: entity.x + entity.halfExtents.x, maxY: entity.y + entity.halfExtents.y };
    const radius = voidEntityRadius(entity);
    return { minX: entity.x - radius, minY: entity.y - radius, maxX: entity.x + radius, maxY: entity.y + radius };
}
/**
 * Hard grid-edge planes — entity cannot cross blocked sides of the prop's obstacle cell.
 *
 * @param {object} entity — mutated
 * @param {object} prop
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 */
export function resolveEntityAgainstCellEdgeBarrier(entity, prop, obstacleGrid) {
    const mask = readCellEdgeBarrierMask(prop);
    if (!mask) return false;
    const cell = getGridCellBoundsForProp(prop, obstacleGrid);
    const facingIndex = quantizeAngleIndex(prop.facing ?? 0, CARDINAL_FACING_STEPS);
    const blocked = blockedWorldEdges(facingIndex, mask);
    let bounds = entityWorldAabb(entity);
    if (bounds.maxX < cell.minX || bounds.minX > cell.maxX || bounds.maxY < cell.minY || bounds.minY > cell.maxY) return false;
    let moved = false;
    if (blocked.north && bounds.minY < cell.minY) {
        entity.y += cell.minY - bounds.minY;
        if ((entity.vy ?? 0) < 0) entity.vy = 0;
        moved = true;
        bounds = entityWorldAabb(entity);
    }
    if (blocked.south && bounds.maxY > cell.maxY) {
        entity.y += cell.maxY - bounds.maxY;
        if ((entity.vy ?? 0) > 0) entity.vy = 0;
        moved = true;
        bounds = entityWorldAabb(entity);
    }
    if (blocked.west && bounds.minX < cell.minX) {
        entity.x += cell.minX - bounds.minX;
        if ((entity.vx ?? 0) < 0) entity.vx = 0;
        moved = true;
        bounds = entityWorldAabb(entity);
    }
    if (blocked.east && bounds.maxX > cell.maxX) {
        entity.x += cell.maxX - bounds.maxX;
        if ((entity.vx ?? 0) > 0) entity.vx = 0;
        moved = true;
    }
    return moved;
}
