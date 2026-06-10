const POOL_BALL_COLORS = { 1: "#FFD600", 2: "#1565C0", 3: "#D32F2F", 4: "#7B1FA2", 5: "#FF6F00", 6: "#2E7D32", 7: "#8B0000", 8: "#1A1A1A" };
const POOL_BALL_PHYSICS = {
    hitBehavior: "none",
    radius: 2,
    isPushable: true,
    rolls: true,
    collisionShape: "circle",
    laserTargetable: false,
    mass: 0.0625,
    pairRestitution: 0.92,
    friction: 0.5,
    lowSpeedFrictionThreshold: 2.5,
    lowSpeedFriction: 2.8,
    snapSpeed: 0.45,
    wallPhysics: { restitution: 0.94, friction: 0.06 },
};
const POOL_BALL_VISUALS = {
    defaultRadius: 2,
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
/** @param {number} number */
function poolBallVisuals(number) {
    const color = POOL_BALL_COLORS[((number - 1) % 8) + 1];
    const defaultPoolBall = number <= 8 ? { kind: "solid", number, color } : { kind: "stripe", number, color };
    return { ...POOL_BALL_VISUALS, defaultPoolBall };
}
/** @param {number} number */
function numberedPoolBall(number) {
    return { id: `pool_ball_${number}`, recipe: "poolBall", sandbox: { spawnable: false }, physics: POOL_BALL_PHYSICS, visuals: poolBallVisuals(number) };
}
/** @type {Record<string, object>} */
const poolBalls = {
    pool_cue_ball: { id: "pool_cue_ball", recipe: "poolBall", sandbox: { spawnable: false }, physics: POOL_BALL_PHYSICS, visuals: { ...POOL_BALL_VISUALS, defaultPoolBall: { kind: "cue" } } },
};
for (let n = 1; n <= 15; n++) poolBalls[`pool_ball_${n}`] = numberedPoolBall(n);
export default poolBalls;
