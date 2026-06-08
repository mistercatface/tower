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
