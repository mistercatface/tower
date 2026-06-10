import { gridSettings } from "../../../Config/Config.js";
import { getResolvedAssembly } from "./assemblies/assemblyRegistry.js";
const _defaultAssembly = getResolvedAssembly("poolTable");
const _layout = _defaultAssembly.layout;
/** Ball radius the default pool assembly was originally tuned at. */
export const POOL_REFERENCE_BALL_RADIUS = _layout.referenceBallRadius;
/** Current pool ball radius from the default assembly manifest. */
export const POOL_BALL_RADIUS = _layout.ballRadius;
export const POOL_SCALE = _layout.scale;
export const POOL_TABLE_COLS = _layout.cols;
export const POOL_TABLE_ROWS = _layout.rows;
export const POOL_TABLE_RAIL_CELLS = _layout.railCells;
export const POOL_CUE_STRIKE = _defaultAssembly.behaviors.pool_cue_ball.cueStrike;
export const POOL_CUE_INPUT_GATES = _defaultAssembly.behaviors.pool_cue_ball.inputGates;
export function getPoolCellSize() {
    return _layout.cellSize;
}
/** @param {number} [ballRadius] */
export function getPoolPocketRadii(ballRadius = POOL_BALL_RADIUS) {
    const ratio = ballRadius / _layout.ballRadius;
    const pockets = _layout.pocketRadii;
    return { corner: pockets.corner * ratio, side: pockets.side * ratio, depth: pockets.depth * ratio };
}
export function getPoolWallPocketSegmentSize() {
    return _layout.wallPocketSegmentSize;
}
/**
 * Render-only knobs — independent of ball radius in the assembly manifest.
 * Sprite bake resolution uses the game default like other props.
 */
export const POOL_VISUAL = {
    panelCount: 10,
    latBands: 6,
    stroke: null,
    faceShade: 0.05,
    labelCapAngle: 0.78,
    labelGridSegments: 16,
    labelSubSegments: 1,
    labelImageSmoothing: false,
    showLabels: false,
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
        lowSpeedFrictionThreshold: 10 * s,
        lowSpeedFriction: 2.8,
        snapSpeed: 1.8 * s,
        wallPhysics: { restitution: 0.94, friction: 0.06 },
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
