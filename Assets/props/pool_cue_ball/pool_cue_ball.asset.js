import { getPoolBallPhysics, getPoolBallVisuals } from "../../../Libraries/Sandbox/poolConfig.js";
export default { id: "pool_cue_ball", recipe: "poolBall", sandbox: { spawnable: false, behaviors: ["cueStrike"] }, physics: getPoolBallPhysics(), visuals: getPoolBallVisuals({ kind: "cue" }) };
