import { getPoolBallPhysics, getPoolBallVisuals, POOL_CUE_INPUT_GATES, POOL_CUE_STRIKE } from "../../../Libraries/Sandbox/poolConfig.js";
export default {
    id: "pool_cue_ball",
    recipe: "poolBall",
    sandbox: { spawnable: false, behaviors: ["cueStrike"], cueStrike: POOL_CUE_STRIKE, inputGates: POOL_CUE_INPUT_GATES },
    physics: getPoolBallPhysics(),
    visuals: getPoolBallVisuals({ kind: "cue" }),
};
