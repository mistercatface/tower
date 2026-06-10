import { getPoolBallPhysics, getPoolBallVisuals } from "../../../Libraries/Sandbox/poolConfig.js";
export default {
    id: "pool_ball",
    recipe: "poolBall",
    sandbox: { spawnable: false, behaviors: [] },
    physics: getPoolBallPhysics(),
    visuals: getPoolBallVisuals({ kind: "solid", number: 1, color: "#FFD600" }),
};
