import { gridSettings } from "../../../Config/Config.js";
import { snapLayoutOrigin } from "../../../Generator/GridLayout.js";
/** Grid size for the pool table wall bake (cells). */
export const TABLE_COLS = 24;
export const TABLE_ROWS = 44;
export const TABLE_RAIL_CELLS = 2;
/** Pool ball radius in world units (physics + render). */
export const POOL_BALL_RADIUS = 16;
/** Pocket sensor radius for corner pockets in world units. */
export const CORNER_POCKET_RADIUS = POOL_BALL_RADIUS * 2.375;
/** Pocket sensor radius for side pockets in world units. */
export const SIDE_POCKET_RADIUS = POOL_BALL_RADIUS * 2.0;
export const POCKET_RADIUS = SIDE_POCKET_RADIUS;
/** Pocket drop depth below ground level in world units. */
export const POOL_POCKET_DEPTH = POOL_BALL_RADIUS * 3.0;
/** Below this speed (world units/s), felt drag ramps up so balls don't creep at the end. */
export const POOL_BALL_LOW_SPEED_THRESHOLD = 10;
export const POOL_BALL_LOW_SPEED_FRICTION = 2.8;
/** Zero linear velocity once speed drops below this (after the ramp). */
export const POOL_BALL_SNAP_SPEED = 1.8;
/** Shot tuning — table is ~700×384 world units; full-length shot needs high v0 + low felt drag */
export const MAX_SHOT_POWER = 1200;
export const MIN_SHOT_POWER = 16;
export const MIN_AIM_DRAG = 10;
export const CUE_GRAB_RADIUS_PAD = 10;
/** Cue stick deltas on `CUE_STICK_DEFAULTS` — ~700×384 world table. */
export const POOL_CUE_HX = 78;
export const POOL_CUE_MAX_PULL = 75;
export const POOL_CUE_MIN_PULL_DRAG = 3;
/** Smooth 3D bake rotation while aiming (library default is 16). */
export const POOL_CUE_QUANTIZE_STEPS = { facing: 256, roll: 256 };
export const POOL_OBJECT_BALL_COUNT = 15;
/** Standard 8-ball triangle: 1 on the foot-spot apex, 8 in the center, solid (6) and stripe (9) on the back corners. */
const RACK_BALL_NUMBERS = [[1], [10, 2], [11, 8, 3], [12, 4, 13, 5], [6, 14, 7, 15, 9]];
/**
 * Equilateral-close-packed rack: apex (row 0) on the foot spot pointing toward the head;
 * each deeper row sits behind it toward the foot rail (+X).
 *
 * @param {{ x: number, y: number }} footSpot
 * @param {number} [ballRadius]
 * @returns {{ x: number, y: number, number: number }[]}
 */
function buildRackPositions(footSpot, ballRadius = POOL_BALL_RADIUS) {
    const rowStep = Math.sqrt(3) * ballRadius;
    const colStep = ballRadius * 2;
    const positions = [];
    for (let row = 0; row < RACK_BALL_NUMBERS.length; row++) {
        const rowBalls = RACK_BALL_NUMBERS[row];
        for (let col = 0; col < rowBalls.length; col++) positions.push({ number: rowBalls[col], x: footSpot.x + (col - row * 0.5) * colStep, y: footSpot.y - row * rowStep });
    }
    return positions;
}
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
/** Felt playfield inside the rail ring (same carve as `PoolTableStrategy`). */
export function getPlayfieldBounds(offsetX, offsetY, cellSize, cols = TABLE_COLS, rows = TABLE_ROWS) {
    const rail = TABLE_RAIL_CELLS * cellSize;
    const table = getTableWorldBounds(offsetX, offsetY, cellSize, cols, rows);
    return { minX: table.minX + rail, minY: table.minY + rail, maxX: table.maxX - rail, maxY: table.maxY - rail, centerX: table.centerX, centerY: table.centerY };
}
/** @typedef {'corner-tl' | 'corner-tr' | 'corner-bl' | 'corner-br' | 'side-left' | 'side-right'} PoolPocketKind */
/** @typedef {{ x: number, y: number, radius: number, kind: PoolPocketKind }} PoolPocket */
/**
 * Six pockets — center on inner felt corners (quarter circle) or inner long-rail midpoints (half circle).
 *
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {number} cellSize
 * @returns {PoolPocket[]}
 */
export function getPocketPositions(offsetX, offsetY, cellSize) {
    const play = getPlayfieldBounds(offsetX, offsetY, cellSize);
    const cr = CORNER_POCKET_RADIUS;
    const sr = SIDE_POCKET_RADIUS;
    return [
        { x: play.minX, y: play.minY, radius: cr, kind: "corner-tl" },
        { x: play.minX, y: play.centerY, radius: sr, kind: "side-left" },
        { x: play.maxX, y: play.minY, radius: cr, kind: "corner-tr" },
        { x: play.minX, y: play.maxY, radius: cr, kind: "corner-bl" },
        { x: play.maxX, y: play.centerY, radius: sr, kind: "side-right" },
        { x: play.maxX, y: play.maxY, radius: cr, kind: "corner-br" },
    ];
}
/** Canvas arc sweep for a pocket mouth opening into the table (clockwise radians). */
export function getPocketArcAngles(kind) {
    switch (kind) {
        case "corner-tl":
            return { start: 0, end: Math.PI / 2 };
        case "corner-tr":
            return { start: Math.PI / 2, end: Math.PI };
        case "corner-bl":
            return { start: (3 * Math.PI) / 2, end: Math.PI * 2 };
        case "corner-br":
            return { start: Math.PI, end: (3 * Math.PI) / 2 };
        case "side-left":
            return { start: -Math.PI / 2, end: Math.PI / 2 };
        case "side-right":
            return { start: Math.PI / 2, end: (3 * Math.PI) / 2 };
        default:
            return { start: 0, end: Math.PI * 2 };
    }
}
/** @param {object} ball @param {PoolPocket} pocket */
export function isBallInPocket(ball, pocket) {
    const dx = ball.x - pocket.x;
    const dy = ball.y - pocket.y;
    return dx * dx + dy * dy <= pocket.radius * pocket.radius;
}
/**
 * @param {number} px
 * @param {number} py
 * @param {number} cellSize
 */
export function buildPoolStartLayout(px, py, cellSize) {
    const cols = TABLE_COLS;
    const rows = TABLE_ROWS;
    const { offsetX, offsetY } = snapLayoutOrigin(px, py, cols, rows, cellSize);
    const bounds = getTableWorldBounds(offsetX, offsetY, cellSize, cols, rows);
    const rail = TABLE_RAIL_CELLS * cellSize;
    const playfieldHeight = bounds.height - 2 * rail;
    const headSpot = { x: bounds.centerX, y: bounds.minY + rail + playfieldHeight * 0.75 };
    // Position the foot spot at regulation 25% of playfield (vertical top), but cap it to keep the rack safe from the top rail
    const regulationFootSpotY = bounds.minY + rail + playfieldHeight * 0.25;
    const minFootSpotY = bounds.minY + rail + (4 * Math.sqrt(3) + 2.5) * POOL_BALL_RADIUS;
    const footSpotY = Math.max(regulationFootSpotY, minFootSpotY);
    const footSpot = { x: bounds.centerX, y: footSpotY };
    return {
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY,
        spawnX: headSpot.x,
        spawnY: headSpot.y,
        spawnClearRadius: POOL_BALL_RADIUS * 3,
        tableCenterX: bounds.centerX,
        tableCenterY: bounds.centerY,
        tableWidth: bounds.width,
        tableHeight: bounds.height,
        pockets: getPocketPositions(offsetX, offsetY, cellSize),
        spawnSlots: { head: headSpot, foot: footSpot },
        ballSpawns: { cue: headSpot, rack: buildRackPositions(footSpot, POOL_BALL_RADIUS) },
        sidePocketRadius: SIDE_POCKET_RADIUS,
        cornerPocketRadius: CORNER_POCKET_RADIUS,
        pocketDepth: POOL_POCKET_DEPTH,
    };
}
/** Layout for the current run, anchored to map spawn origin. */
export function getPoolLayout(state) {
    const { x, y } = state.getMapSpawnOrigin();
    return buildPoolStartLayout(x, y, gridSettings.cellSize);
}
