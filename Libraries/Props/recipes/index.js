import { createLofiSphereDraw } from "./lofiSphereRecipe.js";
import { createPoolBallDraw } from "./poolBallRecipe.js";
import { createFuelBarrelDraw } from "./fuelBarrelRecipe.js";
import { createCrateDraw, createCrateShardDraw } from "./crateRecipe.js";
import { createRollingBoxDraw } from "./rollingBoxRecipe.js";

/** @type {Record<string, (visuals: object, opts?: object) => Function>} */
export const PROP_RECIPE_BUILDERS = {
    lofiSphere: createLofiSphereDraw,
    poolBall: createPoolBallDraw,
    fuelBarrel: createFuelBarrelDraw,
    extrudedBox: createCrateDraw,
    extrudedBoxShard: createCrateShardDraw,
    rollingBox: createRollingBoxDraw,
};
