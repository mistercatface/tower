import * as propAssets from "../../Assets/props/index.js";
import { getResolvedAssembly } from "../Sandbox/assemblies/assemblyRegistry.js";
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
/** @param {object} asset @param {Record<string, { physics: object, visuals: object }>} assemblyProps */
function resolvePropAsset(asset, assemblyProps) {
    const config = assemblyProps[asset.id];
    if (!config) return asset;
    if (!config.physics || !config.visuals) throw new Error(`Assembly props for "${asset.id}" must include physics and visuals`);
    return { ...asset, physics: config.physics, visuals: config.visuals };
}
/** Load shared Assets/props into the runtime prop catalog. Call once before createGame(). */
export function loadPropAssets() {
    const assemblyProps = getResolvedAssembly()?.props;
    if (!assemblyProps) throw new Error("Assembly manifest not loaded — call loadAssemblyManifests() before loadPropAssets()");
    const definitions = {};
    const recipes = {};
    const assets = {};
    for (const asset of Object.values(propAssets)) {
        const resolved = resolvePropAsset(asset, assemblyProps);
        definitions[resolved.id] = assetToDefinition(resolved);
        assets[resolved.id] = resolved;
        registerPropDraw(resolved, recipes);
    }
    setPropCatalog({ definitions, recipes, assets });
}
