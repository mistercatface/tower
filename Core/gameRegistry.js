/** @typedef {import("./GameDefinitionTypes.js").GameDefinition} GameDefinition */
/** @type {Record<string, () => Promise<GameDefinition>>} */
const GAME_LOADERS = { pool: () => import("../Games/pool/gameDefinition.js").then((m) => m.poolGame), tower: () => import("../Games/tower/gameDefinition.js").then((m) => m.towerGame) };
/** @type {keyof typeof GAME_LOADERS} */
export const DEFAULT_GAME_ID = "pool";
export const GAME_IDS = Object.keys(GAME_LOADERS);
/**
 * Load and return the game definition for `?game=<id>` (e.g. `?game=tower`, `?game=pool`).
 * Only the selected game's modules are imported.
 *
 * @param {string} [search] — defaults to `window.location.search`
 * @returns {Promise<GameDefinition>}
 */
export async function loadGameFromUrl(search = typeof window !== "undefined" ? window.location.search : "") {
    const id = new URLSearchParams(search).get("game") ?? DEFAULT_GAME_ID;
    const loader = GAME_LOADERS[id];
    if (!loader) {
        console.warn(`Unknown game "${id}" — falling back to ${DEFAULT_GAME_ID}. Available: ${GAME_IDS.join(", ")}`);
        return GAME_LOADERS[DEFAULT_GAME_ID]();
    }
    return loader();
}
