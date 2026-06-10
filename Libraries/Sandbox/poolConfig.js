import { gridSettings } from "../../Config/Config.js";
/** Ball radius the sandbox pool package was originally tuned at. */
export const POOL_REFERENCE_BALL_RADIUS = 8;
/** Current pool ball radius — change this to rescale the whole table package. */
export const POOL_BALL_RADIUS = 4;
export const POOL_SCALE = POOL_BALL_RADIUS / POOL_REFERENCE_BALL_RADIUS;
export const POOL_TABLE_COLS = 24;
export const POOL_TABLE_ROWS = 44;
export const POOL_TABLE_RAIL_CELLS = 2;
/** Pocket arc wall segment length at reference scale. */
const POOL_REFERENCE_WALL_POCKET_SEGMENT_SIZE = 6;
/** Cue-strike tuning at {@link POOL_REFERENCE_BALL_RADIUS}. */
const POOL_REFERENCE_CUE_STRIKE = { minDrag: 3, maxPull: 75, pullScale: 0.5, minPower: 16, maxPower: 1200 };
/** @param {number} value */
function scale(value) {
    return value * POOL_SCALE;
}
export function getPoolCellSize() {
    return gridSettings.cellSize * POOL_SCALE;
}
/** @param {number} [ballRadius] */
export function getPoolPocketRadii(ballRadius = POOL_BALL_RADIUS) {
    return { corner: ballRadius * 2.15, side: ballRadius * 1.75, depth: ballRadius * 3 };
}
export function getPoolWallPocketSegmentSize() {
    return scale(POOL_REFERENCE_WALL_POCKET_SEGMENT_SIZE);
}
export const POOL_CUE_STRIKE = {
    minDrag: scale(POOL_REFERENCE_CUE_STRIKE.minDrag),
    maxPull: scale(POOL_REFERENCE_CUE_STRIKE.maxPull),
    pullScale: POOL_REFERENCE_CUE_STRIKE.pullScale,
    minPower: scale(POOL_REFERENCE_CUE_STRIKE.minPower),
    maxPower: scale(POOL_REFERENCE_CUE_STRIKE.maxPower),
};
/**
 * Render-only knobs — independent of {@link POOL_BALL_RADIUS}.
 * Physics, table layout, pockets, and cue power stay on POOL_BALL_RADIUS / POOL_SCALE.
 */
export const POOL_VISUAL = {
    panelCount: 10,
    latBands: 6,
    stroke: null,
    /** Softer equator/pole tint — lower reads rounder, less chunky. */
    faceShade: 0.05,
    labelCapAngle: 0.78,
    labelGridSegments: 16,
    labelSubSegments: 1,
    labelImageSmoothing: false,
    /** Sprite bake diameter cap (strategy.propPixelSize). */
    propPixelSize: 24,
};
/** Shared pool-ball physics block for prop assets. */
export function getPoolBallPhysics() {
    const s = POOL_SCALE;
    return {
        hitBehavior: "none",
        radius: POOL_BALL_RADIUS,
        isPushable: true,
        rolls: true,
        collisionShape: "circle",
        laserTargetable: false,
        mass: 1.0 * s * s,
        pairRestitution: 0.92,
        friction: 0.5,
        lowSpeedFrictionThreshold: scale(10),
        lowSpeedFriction: 2.8,
        snapSpeed: scale(1.8),
        wallPhysics: { restitution: 0.94, friction: 0.06 },
        propPixelSize: POOL_VISUAL.propPixelSize,
    };
}
/** @param {object} defaultPoolBall */
export function getPoolBallVisuals(defaultPoolBall) {
    return { defaultPoolBall, defaultRadius: POOL_BALL_RADIUS, ...POOL_VISUAL };
}
/** @param {number} [tableWidth] @param {number} [tableHeight] */
export function getPoolTableWorldSize(tableWidth = POOL_TABLE_COLS * getPoolCellSize(), tableHeight = POOL_TABLE_ROWS * getPoolCellSize()) {
    return { tableWidth, tableHeight };
}
