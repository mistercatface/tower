import propCatalog from "../../Assets/props/index.js";
import { PROP_PRIMITIVE_BUILDERS } from "./primitives/index.js";

/** WorldProp strategy fields derived from asset.physics — keyed by prop type id. */
export const worldPropDefinitions = {};
/** Draw recipes keyed by prop render3DKey. */
export const worldPropRecipes = {};

function assetToDefinition(asset) {
    const { id, physics } = asset;
    const { spawn, renderMode, ...strategy } = physics;
    return { render3DKey: id, renderMode: renderMode ?? "3d", spawn, inspectKey: null, ...strategy };
}

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

function buildCatalogRecords(sourceCatalog) {
    const definitions = {};
    const recipes = {};
    for (const asset of Object.values(sourceCatalog)) {
        if (!asset.physics) throw new Error(`Asset "${asset.id}" must include physics`);
        definitions[asset.id] = assetToDefinition(asset);
        registerPropDraw(asset, recipes);
    }
    return { definitions, recipes };
}

const shipped = buildCatalogRecords(propCatalog);
Object.assign(worldPropDefinitions, shipped.definitions);
Object.assign(worldPropRecipes, shipped.recipes);

export function formatPropTypeLabel(typeId) {
    return (typeId ?? "prop").replace(/_/g, " ");
}

export function formatSandboxSpawnLabel(propId) {
    const asset = propCatalog[propId];
    return asset?.sandbox?.spawnLabel ?? formatPropTypeLabel(propId);
}
