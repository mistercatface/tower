import { createArenaPhase, finalizeWorldPhase, initMapSpawnPhase, singleNodeGraphPhase } from "../phases.js";
import { createWorldGenPort } from "../WorldGenPipeline.js";
/** @typedef {import("../../../Core/GameDefinitionTypes.js").WorldGenPort} WorldGenPort */
/** @typedef {import("../phases.js").WorldGenPhase} WorldGenPhase */
/**
 * @typedef {object} SingleArenaWorldGenOptions
 * @property {(state: object, px: number, py: number) => void} generateArena
 * @property {WorldGenPort["getPlayBounds"]} getPlayBounds
 * @property {WorldGenPort["getStartLayout"]} getStartLayout
 * @property {(state: object) => void} [onNodeReady]
 * @property {(state: object, origin: { x: number, y: number }) => { centerX: number, centerY: number }} [resolveFocus]
 * @property {WorldGenPhase[]} [extraPhases] — run after arena, before finalize
 * @property {boolean} [skipStartPickups]
 * @property {Record<string, import("../../../Core/GameDefinitionTypes.js").WorldGenStrategy>} [strategies]
 * @property {number} [startMapNodeId]
 */
/**
 * Single-node arena games (pool, sports courts, etc.) — no map graph or CA backdrop.
 *
 * @param {SingleArenaWorldGenOptions} options
 * @returns {WorldGenPort}
 */
export function createSingleArenaWorldGenPort(options) {
    const { generateArena, getPlayBounds, getStartLayout, onNodeReady, resolveFocus, extraPhases = [], skipStartPickups, strategies, startMapNodeId = 0 } = options;
    return createWorldGenPort([initMapSpawnPhase, singleNodeGraphPhase, createArenaPhase(generateArena, { onNodeReady, resolveFocus }), ...extraPhases, finalizeWorldPhase], {
        getPlayBounds,
        getStartLayout,
        skipStartPickups,
        strategies,
        startMapNodeId,
    });
}
