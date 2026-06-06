import { buildRackPositions } from "./rackLayout.js";

/** Grid size for the pool table wall bake (cells). */
export const TABLE_COLS = 44;
export const TABLE_ROWS = 24;
export const TABLE_RAIL_CELLS = 2;

/** Pool ball radius in world units (physics + render). */
export const POOL_BALL_RADIUS = 8;

/** Pocket sensor radius in world units. */
export const POCKET_RADIUS = 14;

/** Ball stop threshold — max speed² to allow aiming. */
export const BALL_STOPPED_SPEED_SQ = 4;

/** Shot tuning — table is ~700×384 world units; full-length shot needs high v0 + low felt drag */
export const MAX_SHOT_POWER = 580;
export const SHOT_POWER_SCALE = 3.2;
export const MIN_AIM_DRAG = 10;
export const CUE_GRAB_RADIUS_PAD = 10;

/**
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {number} cellSize
 * @param {number} cols
 * @param {number} rows
 */
export function getTableWorldBounds(offsetX, offsetY, cellSize, cols = TABLE_COLS, rows = TABLE_ROWS) {
    return {
        minX: offsetX,
        minY: offsetY,
        maxX: offsetX + cols * cellSize,
        maxY: offsetY + rows * cellSize,
        centerX: offsetX + (cols * cellSize) / 2,
        centerY: offsetY + (rows * cellSize) / 2,
        width: cols * cellSize,
        height: rows * cellSize,
    };
}

/**
 * Six pocket sensor positions (world coords) inset from playfield corners and side middles.
 *
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {number} cellSize
 * @returns {{ x: number, y: number, radius: number }[]}
 */
export function getPocketPositions(offsetX, offsetY, cellSize) {
    const rail = TABLE_RAIL_CELLS * cellSize;
    const w = TABLE_COLS * cellSize;
    const h = TABLE_ROWS * cellSize;
    const inset = rail + POCKET_RADIUS * 0.55;

    return [
        { x: offsetX + inset, y: offsetY + inset, radius: POCKET_RADIUS },
        { x: offsetX + w / 2, y: offsetY + inset, radius: POCKET_RADIUS },
        { x: offsetX + w - inset, y: offsetY + inset, radius: POCKET_RADIUS },
        { x: offsetX + inset, y: offsetY + h - inset, radius: POCKET_RADIUS },
        { x: offsetX + w / 2, y: offsetY + h - inset, radius: POCKET_RADIUS },
        { x: offsetX + w - inset, y: offsetY + h - inset, radius: POCKET_RADIUS },
    ];
}

/**
 * @param {number} px
 * @param {number} py
 * @param {number} cellSize
 */
export function buildPoolStartLayout(px, py, cellSize) {
    const cols = TABLE_COLS;
    const rows = TABLE_ROWS;
    const offsetX = px - (cols * cellSize) / 2;
    const offsetY = py - (rows * cellSize) / 2;
    const bounds = getTableWorldBounds(offsetX, offsetY, cellSize, cols, rows);

    const headSpot = { x: bounds.minX + bounds.width * 0.28, y: bounds.centerY };
    const footSpot = { x: bounds.minX + bounds.width * 0.77, y: bounds.centerY };

    return {
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY,
        spawnX: headSpot.x,
        spawnY: headSpot.y,
        spawnClearRadius: 24,
        tableCenterX: bounds.centerX,
        tableCenterY: bounds.centerY,
        tableWidth: bounds.width,
        tableHeight: bounds.height,
        pockets: getPocketPositions(offsetX, offsetY, cellSize),
        spawnSlots: {
            head: headSpot,
            foot: footSpot,
        },
        ballSpawns: {
            cue: headSpot,
            rack: buildRackPositions(footSpot, POOL_BALL_RADIUS),
        },
    };
}
