import { JACKO_LABEL_SRC } from "../../../Config/props/JackoCan.js";
import { getPropInspectRecipe } from "../PropInspectRecipes.js";

const recipe = getPropInspectRecipe("jacko_can");

export function preloadJackoFuelLabel() {
    recipe?.preload();
}

export function onJackoFuelLabelReady(fn) {
    recipe?.onReady(fn);
}

export function drawJackoFuelBarrelInspect(ctx, cx, cy, scale, yaw, pitch) {
    recipe?.draw(ctx, cx, cy, scale, yaw, pitch);
}

export { JACKO_LABEL_SRC };
