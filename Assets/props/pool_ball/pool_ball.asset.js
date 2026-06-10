import { getPoolBallPhysics, POOL_BALL_RADIUS } from "../../../Libraries/Sandbox/poolConfig.js";

export default {
    id: "pool_ball",
    recipe: "poolBall",
    sandbox: { spawnable: false, behaviors: [] },
    physics: getPoolBallPhysics(),
    visuals: { defaultPoolBall: { kind: "solid", number: 1, color: "#FFD600" }, defaultRadius: POOL_BALL_RADIUS, panelCount: 12, latBands: 8, stroke: null },
};
