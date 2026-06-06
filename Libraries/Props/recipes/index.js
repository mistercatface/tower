import { createLofiSphereDraw } from "./lofiSphereRecipe.js";
import { createFuelBarrelDraw } from "./fuelBarrelRecipe.js";
import { createCrateDraw, createCrateShardDraw } from "./crateRecipe.js";

/** @type {Record<string, (visuals: object, opts?: object) => Function>} */
export const PROP_RECIPE_BUILDERS = {
    lofiSphere: createLofiSphereDraw,
    fuelBarrel: createFuelBarrelDraw,
    extrudedBox: createCrateDraw,
    extrudedBoxShard: createCrateShardDraw,
};
