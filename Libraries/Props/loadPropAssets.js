import * as propAssets from "../../Assets/props/index.js";
import { setPropCatalog } from "./PropCatalog.js";
import { PROP_PRIMITIVE_BUILDERS } from "./primitives/index.js";
import { PROP_RECIPE_BUILDERS } from "./recipes/index.js";
/**
 * @param {object} asset
 */
function assetToDefinition(asset) {
    const { id, physics } = asset;
    const { hitBehavior, spawn, renderMode, ...strategy } = physics;
    return { render3DKey: id, renderMode: renderMode ?? "3d", hitBehavior, spawn, inspectKey: null, ...strategy };
}
/**
 * @param {object} asset
 * @param {Record<string, Function>} recipes
 */
function registerPropDraw(asset, recipes) {
    if (asset.physics?.renderMode === "none") {
        recipes[asset.id] = () => {};
        return;
    }
    if (asset.primitive) {
        const builder = PROP_PRIMITIVE_BUILDERS[asset.primitive];
        if (!builder) throw new Error(`Unknown primitive "${asset.primitive}" for asset "${asset.id}"`);
        recipes[asset.id] = builder(asset.visuals);
        return;
    }
    if (asset.recipe) {
        const builder = PROP_RECIPE_BUILDERS[asset.recipe];
        if (!builder) throw new Error(`Unknown recipe "${asset.recipe}" for asset "${asset.id}"`);
        recipes[asset.id] = builder(asset.visuals);
        return;
    }
    throw new Error(`Asset "${asset.id}" must define primitive or recipe`);
}
/** Load shared Assets/props into the runtime prop catalog. Call once before createGame(). */
export function loadPropAssets() {
    const definitions = {};
    const recipes = {};
    const assets = {};
    for (const asset of Object.values(propAssets)) {
        definitions[asset.id] = assetToDefinition(asset);
        assets[asset.id] = asset;
        registerPropDraw(asset, recipes);
    }
    setPropCatalog({ definitions, recipes, assets });
}
