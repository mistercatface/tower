import propCatalog from "../../Assets/props/index.js";
import { setPropCatalog } from "./PropCatalog.js";
import { PROP_PRIMITIVE_BUILDERS } from "./primitives/index.js";
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
    if (typeof asset.draw === "function") {
        recipes[asset.id] = asset.draw;
        return;
    }
    if (asset.primitive) {
        const builder = PROP_PRIMITIVE_BUILDERS[asset.primitive];
        if (!builder) throw new Error(`Unknown primitive "${asset.primitive}" for asset "${asset.id}"`);
        recipes[asset.id] = builder(asset.visuals);
        return;
    }
    throw new Error(`Asset "${asset.id}" must define draw or primitive`);
}
/** Load shared Assets/props into the runtime prop catalog. Call once before boot. */
export function loadPropAssets() {
    const definitions = {};
    const recipes = {};
    const assets = {};
    for (const asset of Object.values(propCatalog)) {
        if (!asset.physics) throw new Error(`Asset "${asset.id}" must include physics`);
        definitions[asset.id] = assetToDefinition(asset);
        assets[asset.id] = asset;
        registerPropDraw(asset, recipes);
    }
    setPropCatalog({ definitions, recipes, assets });
}
