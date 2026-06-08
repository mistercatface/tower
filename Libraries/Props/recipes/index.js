import { createPoolBallDraw } from "./poolBallRecipe.js";
/** @type {Record<string, (visuals: object) => Function>} */
export const PROP_RECIPE_BUILDERS = { poolBall: createPoolBallDraw };
