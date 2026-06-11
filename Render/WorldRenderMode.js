/** @typedef {"radial" | "flat2d"} WorldRenderMode */
export const WORLD_RENDER_MODE_RADIAL = /** @type {WorldRenderMode} */ ("radial");
export const WORLD_RENDER_MODE_FLAT2D = /** @type {WorldRenderMode} */ ("flat2d");
export const WORLD_RENDER_MODE_DEFAULT = WORLD_RENDER_MODE_RADIAL;
/** @type {WorldRenderMode[]} */
export const WORLD_RENDER_MODE_OPTIONS = [WORLD_RENDER_MODE_RADIAL, WORLD_RENDER_MODE_FLAT2D];
export const WORLD_RENDER_MODE_LABELS = {
    radial: "Radial",
    flat2d: "2D",
};
/** @param {string | null | undefined} mode */
export function normalizeWorldRenderMode(mode) {
    return mode === WORLD_RENDER_MODE_FLAT2D ? WORLD_RENDER_MODE_FLAT2D : WORLD_RENDER_MODE_RADIAL;
}
