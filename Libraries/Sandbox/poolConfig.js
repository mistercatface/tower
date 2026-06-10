import { getResolvedAssembly } from "./assemblies/assemblyRegistry.js";
function poolAssembly() {
    const assembly = getResolvedAssembly("poolTable");
    if (!assembly) throw new Error("Pool table assembly not loaded — call loadAssemblyManifests() first");
    return assembly;
}
export function getPoolReferenceBallRadius() {
    return poolAssembly().scale.referenceBallRadius;
}
export function getPoolBallRadius() {
    return poolAssembly().scale.ballRadius;
}
export function getPoolScale() {
    return poolAssembly().scale.factor;
}
export const POOL_REFERENCE_BALL_RADIUS = 8;
export const POOL_BALL_RADIUS = 2;
export const POOL_SCALE = POOL_BALL_RADIUS / POOL_REFERENCE_BALL_RADIUS;
export const POOL_TABLE_COLS = 24;
export const POOL_TABLE_ROWS = 44;
export const POOL_TABLE_RAIL_CELLS = 2;
export function getPoolCueStrike() {
    return poolAssembly().behaviors.pool_cue_ball.cueStrike;
}
export function getPoolCueInputGates() {
    return poolAssembly().behaviors.pool_cue_ball.inputGates;
}
export function getPoolCellSize() {
    return poolAssembly().arena.cellSize;
}
/** @param {number} [ballRadius] */
export function getPoolVoidRadii(ballRadius = getPoolBallRadius()) {
    const assembly = poolAssembly();
    const ratio = ballRadius / assembly.scale.ballRadius;
    const radii = assembly.refs.voidRadii;
    return { corner: radii.corner * ratio, side: radii.side * ratio, depth: radii.depth * ratio };
}
export function getPoolVoidBackArcSegmentSize() {
    return poolAssembly().arena.walls.voidBackArcSegmentSize;
}
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
export function getPoolBallPhysics() {
    const ballRadius = getPoolBallRadius();
    const s = ballRadius / getPoolReferenceBallRadius();
    return {
        hitBehavior: "none",
        radius: ballRadius,
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
    return { defaultPoolBall, defaultRadius: getPoolBallRadius(), ...POOL_VISUAL };
}
/** @param {number} [tableWidth] @param {number} [tableHeight] */
export function getPoolTableWorldSize(tableWidth = getPoolTableCols() * getPoolCellSize(), tableHeight = getPoolTableRows() * getPoolCellSize()) {
    return { tableWidth, tableHeight };
}
export function getPoolTableCols() {
    return poolAssembly().arena.grid.cols;
}
export function getPoolTableRows() {
    return poolAssembly().arena.grid.rows;
}
