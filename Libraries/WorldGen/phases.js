import { finalizeGeneratedWorld } from "./finalizeGeneratedWorld.js";
import { beginWorldGenRuntime } from "./WorldGenRuntime.js";
/**
 * @typedef {object} WorldGenContext
 * @property {object} state
 * @property {import("./WorldGenRuntime.js").WorldGenRuntime} runtime
 */
/** @typedef {{ run: (ctx: WorldGenContext) => void }} WorldGenPhase */
/** @param {object} state */
function defaultWorldFocus(state) {
    return { centerX: state.viewport.x, centerY: state.viewport.y };
}
/**
 * Build walls from a game-specific arena generator (pool table, yard, etc.).
 *
 * @param {(state: object, px: number, py: number) => void} generateArena
 * @param {{ resolveFocus?: (state: object, origin: { x: number, y: number }) => { centerX: number, centerY: number } }} [hooks]
 * @returns {WorldGenPhase}
 */
export function createArenaPhase(generateArena, hooks = {}) {
    return {
        run(ctx) {
            const { state, runtime } = ctx;
            state.walls = [];
            state.wallSpatialIndex.clear();
            const origin = { x: state.viewport.x, y: state.viewport.y };
            generateArena(state, origin.x, origin.y);
            for (const wall of state.walls) state.wallSpatialIndex.insert(wall);
            const focus = hooks.resolveFocus?.(state, origin) ?? defaultWorldFocus(state);
            runtime.worldFocus = { centerX: focus.centerX, centerY: focus.centerY };
        },
    };
}
/** @type {WorldGenPhase} */
export const finalizeWorldPhase = {
    run(ctx) {
        const { state, runtime } = ctx;
        const focus = runtime.worldFocus ?? defaultWorldFocus(state);
        finalizeGeneratedWorld(state, { centerX: focus.centerX, centerY: focus.centerY, gridBounds: null });
    },
};
/** @param {object} state @returns {WorldGenContext} */
export function createWorldGenContext(state) {
    return { state, runtime: beginWorldGenRuntime() };
}
