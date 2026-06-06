import { createCueStickDraw } from "../Props/recipes/cueStickRecipe.js";

/** Register the shared cue-stick 3D recipe on the global prop catalog. */
export function registerCueStickRecipe(recipes) {
    if (!recipes.cue_stick) recipes.cue_stick = createCueStickDraw();
}
