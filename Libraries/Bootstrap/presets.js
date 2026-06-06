/** @typedef {import("../../Core/GameDefinitionTypes.js").BootstrapPort} BootstrapPort */
/** @param {BootstrapPort["features"]} features @returns {BootstrapPort} */
export function createBootstrapPort(features) {
    return { features };
}
/** Tower — upgrades, inspect, save, persistent triggers. */
export const COMBAT_ROGUELIKE_BOOTSTRAP = createBootstrapPort({ upgrades: true, inspect: true, save: true, persistentTriggers: true });
/** Pool / arena — minimal engine boot. */
export const MINIMAL_ARENA_BOOTSTRAP = createBootstrapPort({ upgrades: false, inspect: false, save: true, persistentTriggers: true });
