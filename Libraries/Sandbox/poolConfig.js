import { getResolvedAssembly } from "./assemblies/assemblyRegistry.js";
function poolAssembly() {
    const assembly = getResolvedAssembly("poolTable");
    if (!assembly) throw new Error("Pool table assembly not loaded — call loadAssemblyManifests() first");
    return assembly;
}
export function getPoolBallRadius() {
    return poolAssembly().scale.ballRadius;
}
export const POOL_BALL_RADIUS = 2;
export function getPoolCueStrike() {
    return poolAssembly().behaviors.pool_cue_ball.cueStrike;
}
export function getPoolCueInputGates() {
    return poolAssembly().behaviors.pool_cue_ball.inputGates;
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
    const massScale = (ballRadius / 8) ** 2;
    return {
        hitBehavior: "none",
        radius: ballRadius,
        isPushable: true,
        rolls: true,
        collisionShape: "circle",
        laserTargetable: false,
        mass: 1.0 * massScale,
        pairRestitution: 0.92,
        friction: 0.5,
        lowSpeedFrictionThreshold: 10 * (ballRadius / 8),
        lowSpeedFriction: 2.8,
        snapSpeed: 1.8 * (ballRadius / 8),
        wallPhysics: { restitution: 0.94, friction: 0.06 },
    };
}
/** @param {object} defaultPoolBall */
export function getPoolBallVisuals(defaultPoolBall) {
    return { defaultPoolBall, defaultRadius: getPoolBallRadius(), ...POOL_VISUAL };
}
/** @param {number} [tableWidth] @param {number} [tableHeight] */
export function getPoolTableWorldSize(tableWidth = getPoolTableWidth(), tableHeight = getPoolTableHeight()) {
    return { tableWidth, tableHeight };
}
export function getPoolTableWidth() {
    return poolAssembly().arena.width;
}
export function getPoolTableHeight() {
    return poolAssembly().arena.height;
}
