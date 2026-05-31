import { worldPropDefinitions } from "../../Config/PropDefinitions.js";
import { propInspectDefinitions } from "../../Config/PropInspectDefinitions.js";
import { registerPropInspect } from "../InspectRegistry.js";
import { getPropInspectRecipe } from "../3D/PropInspectRecipes.js";

/** Wire inspectable props from Config → recipes. No per-prop registration blocks. */
export function registerInspectableProps() {
    for (const [pickupType, def] of Object.entries(worldPropDefinitions)) {
        const inspectKey = def.inspectKey;
        if (!inspectKey) continue;

        const meta = propInspectDefinitions[inspectKey];
        const recipe = getPropInspectRecipe(inspectKey);
        if (!meta || !recipe) continue;

        registerPropInspect(pickupType, {
            title: meta.title,
            tapPadding: meta.tapPadding,
            preload: recipe.preload,
            onReady: recipe.onReady,
            getInitialYaw: (pickup) => pickup.facing ?? 0,
            draw: recipe.draw,
        });
    }
}
