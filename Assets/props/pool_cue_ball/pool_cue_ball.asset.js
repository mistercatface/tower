import { getPoolBallPhysics, getPoolBallVisuals, POOL_CUE_STRIKE } from "../../../Libraries/Sandbox/poolConfig.js";
export default {
    id: "pool_cue_ball",
    recipe: "poolBall",
    sandbox: { spawnable: false, behaviors: ["cueStrike"], cueStrike: POOL_CUE_STRIKE },
    physics: getPoolBallPhysics(),
    visuals: getPoolBallVisuals({ kind: "cue" }),
};
