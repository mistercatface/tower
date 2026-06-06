/**
 * Scratch data shared across world-gen phases for one `generateWorld` run.
 *
 * @typedef {object} WorldGenRuntime
 * @property {{ minX: number, minY: number, maxX: number, maxY: number, centerX: number, centerY: number } | null} worldFocus
 * @property {import("../../Entities/Wall.js").Segment[]} caWalls
 * @property {object[][]} layers
 */
/** @returns {WorldGenRuntime} */
export function beginWorldGenRuntime() {
    return { worldFocus: null, caWalls: [], layers: [] };
}
