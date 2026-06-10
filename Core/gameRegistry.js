/** @typedef {import("./GameDefinitionTypes.js").GameDefinition} GameDefinition */
/** @type {Record<string, () => Promise<GameDefinition>>} */
const GAME_LOADERS = {};
export const GAME_IDS = Object.keys(GAME_LOADERS);
/**
 * Load a playable game definition by id (for `?game=<id>` play modes — not the Editor app).
 *
 * @param {string} gameId
 * @returns {Promise<GameDefinition>}
 */
export async function loadGameDefinition(gameId) {
    const loader = GAME_LOADERS[gameId];
    if (!loader) {
        const available = GAME_IDS.length ? GAME_IDS.join(", ") : "(none yet)";
        throw new Error(`Unknown game "${gameId}". Available: ${available}`);
    }
    return loader();
}
