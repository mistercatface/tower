import { poolGame } from "../Games/pool/gameDefinition.js";
import { towerGame } from "../Games/tower/gameDefinition.js";

/** @typedef {import("./GameDefinitionTypes.js").GameDefinition} GameDefinition */

/** @type {Record<string, GameDefinition>} */
export const GAME_REGISTRY = {
    pool: poolGame,
    tower: towerGame,
};

/** @type {keyof typeof GAME_REGISTRY} */
export const DEFAULT_GAME_ID = "pool";

/**
 * Resolve which game to boot from `?game=<id>` (e.g. `?game=tower`, `?game=pool`).
 *
 * @param {string} [search] — defaults to `window.location.search`
 * @returns {GameDefinition}
 */
export function resolveGameFromUrl(search = typeof window !== "undefined" ? window.location.search : "") {
    const id = new URLSearchParams(search).get("game") ?? DEFAULT_GAME_ID;
    const game = GAME_REGISTRY[id];
    if (!game) {
        console.warn(`Unknown game "${id}" — falling back to ${DEFAULT_GAME_ID}. Available: ${Object.keys(GAME_REGISTRY).join(", ")}`);
        return GAME_REGISTRY[DEFAULT_GAME_ID];
    }
    return game;
}
