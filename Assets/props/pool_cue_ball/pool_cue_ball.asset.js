import { getPoolBallPhysics, POOL_BALL_RADIUS, POOL_CUE_STRIKE } from "../../../Libraries/Sandbox/poolConfig.js";

export default {
    id: "pool_cue_ball",
    recipe: "poolBall",
    sandbox: { spawnable: false, behaviors: ["cueStrike"], cueStrike: POOL_CUE_STRIKE },
    physics: getPoolBallPhysics(),
    visuals: { defaultPoolBall: { kind: "cue" }, defaultRadius: POOL_BALL_RADIUS, panelCount: 12, latBands: 8, stroke: null },
};
