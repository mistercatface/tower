import { createPoolBallDraw } from "./poolBallRecipe.js";
import { createVoidCircleDraw } from "./voidCircleRecipe.js";
/** @type {Record<string, (visuals: object) => Function>} */
export const PROP_RECIPE_BUILDERS = { poolBall: createPoolBallDraw, voidCircle: createVoidCircleDraw };
