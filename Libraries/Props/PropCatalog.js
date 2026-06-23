/** @type {Record<string, object>} */
let definitions = {};
/** Draw recipes keyed by prop render3DKey — filled by loadPropAssets / setPropCatalog. */
export const worldPropRecipes = {};
/** @type {Record<string, object>} */
let assetsById = {};
function replaceRecordContents(target, source) {
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(target, source);
}
/**
 * @param {{ definitions: Record<string, object>, recipes: Record<string, Function>, assets: Record<string, object> }} catalog
 */
export function setPropCatalog({ definitions: defs, recipes: drawRecipes, assets }) {
    definitions = defs;
    replaceRecordContents(worldPropRecipes, drawRecipes);
    assetsById = assets;
}
export function getWorldPropDefinitions() {
    return definitions;
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
