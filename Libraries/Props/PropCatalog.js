/** @type {Record<string, object>} */
let definitions = {};
/** @type {Record<string, Function>} */
let recipes = {};
/** @type {Record<string, object>} */
let assetsById = {};
/**
 * @param {{ definitions: Record<string, object>, recipes: Record<string, Function>, assets: Record<string, object> }} catalog
 */
export function setPropCatalog({ definitions: defs, recipes: drawRecipes, assets }) {
    definitions = defs;
    recipes = drawRecipes;
    assetsById = assets;
}
export function getWorldPropDefinitions() {
    return definitions;
}
export function getWorldPropRecipes() {
    return recipes;
}
/** @param {string} id */
export function getPropAsset(id) {
    return assetsById[id] ?? null;
}
/** @param {string | null | undefined} typeId */
export function formatPropTypeLabel(typeId) {
    return (typeId ?? "prop").replace(/_/g, " ");
}
/** @param {string} propId */
export function formatSandboxSpawnLabel(propId) {
    const asset = getPropAsset(propId);
    return asset?.sandbox?.spawnLabel ?? formatPropTypeLabel(propId);
}
