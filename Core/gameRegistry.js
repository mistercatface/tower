/** @typedef {import("./GameDefinitionTypes.js").GameDefinition} GameDefinition */
const loadEditor = () => import("../Apps/Editor/index.js").then((m) => m.editorGame);
/** @type {Record<string, () => Promise<GameDefinition>>} */
const GAME_LOADERS = {
    editor: loadEditor,
    tilelab: loadEditor,
};
/** @type {keyof typeof GAME_LOADERS} */
export const DEFAULT_GAME_ID = "editor";
export const GAME_IDS = Object.keys(GAME_LOADERS);
/**
 * Load and return the game definition for `?game=<id>` (e.g. `?game=editor`).
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
