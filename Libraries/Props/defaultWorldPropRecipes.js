import { drawBeachBall } from "./draw/beachBall.js";
import { drawCrate, drawCrateShard } from "./draw/crate.js";
import { drawFireFuelBarrel, drawFuelBarrel } from "./draw/fuelBarrel.js";

/** Default iso world prop draw registry — games extend or replace via render ports. */
export const defaultWorldPropRecipes = {
    barrel: drawFuelBarrel,
    fire_barrel: drawFireFuelBarrel,
    crate: drawCrate,
    crate_shard: drawCrateShard,
    beach_ball: drawBeachBall,
};
