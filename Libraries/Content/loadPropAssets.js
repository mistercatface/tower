import * as propAssets from "../../Assets/props/index.js";
import { setPropCatalog } from "./PropCatalog.js";
import { PROP_RECIPE_BUILDERS } from "../Props/recipes/index.js";

/**
 * @param {object} asset
 */
function assetToDefinition(asset) {
    const { id, physics } = asset;
    const { hitBehavior, spawn, renderMode, ...strategy } = physics;
    return {
        render3DKey: id,
        renderMode: renderMode ?? "3d",
        hitBehavior,
        spawn,
        inspectKey: null,
        ...strategy,
    };
}

/**
 * @param {object} asset
 * @param {Record<string, Function>} recipes
 */
function registerAssetRecipes(asset, recipes) {
    const builder = PROP_RECIPE_BUILDERS[asset.recipe];
    if (!builder) {
        throw new Error(`Unknown prop recipe "${asset.recipe}" for asset "${asset.id}"`);
    }
    recipes[asset.id] = builder(asset.visuals);

    if (asset.id === "barrel") {
        recipes.fire_barrel = PROP_RECIPE_BUILDERS.fuelBarrel(asset.visuals, { onFire: true });
    }
}

/** Load shared Assets/props into the runtime prop catalog. Call once before createGame(). */
export function loadPropAssets() {
    const definitions = {};
    const recipes = {};
    const assets = {};

    for (const asset of Object.values(propAssets)) {
        definitions[asset.id] = assetToDefinition(asset);
        assets[asset.id] = asset;
        registerAssetRecipes(asset, recipes);
    }

    setPropCatalog({ definitions, recipes, assets });
}
