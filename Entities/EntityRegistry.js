/**
 * Active entity catalog for the running game. Populated from game config during bootstrap.
 */
/** @typedef {import("./EntityRegistryTypes.js").EntityCatalog} EntityCatalog */
/** @typedef {import("./EntityRegistryTypes.js").EnemyEntityDefinition} EnemyEntityDefinition */
/** @typedef {import("./EntityRegistryTypes.js").AllyEntityDefinition} AllyEntityDefinition */
/** @type {EntityCatalog | null} */
let catalog = null;
/** @param {EntityCatalog} next */
export function registerEntityCatalog(next) {
    catalog = next;
}
export function getEntityCatalog() {
    return catalog;
}
/** @param {string} typeId */
export function getEnemyDefinition(typeId) {
    return catalog?.enemies?.[typeId] ?? null;
}
/** @returns {EnemyEntityDefinition[]} */
export function getEnemyTypes() {
    if (!catalog?.enemies) return [];
    return Object.values(catalog.enemies);
}
/** @param {string} allyId */
export function getAllyDefinition(allyId) {
    return catalog?.allies?.[allyId] ?? null;
}
/** @returns {string[]} */
export function getRunParty() {
    return catalog?.runParty ?? [];
}
