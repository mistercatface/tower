/** @typedef {"radial" | "flat2d" | "radialSpheres"} WorldRenderMode */
export const WORLD_RENDER_MODE_RADIAL = "radial";
export const WORLD_RENDER_MODE_FLAT2D = "flat2d";
export const WORLD_RENDER_MODE_RADIAL_SPHERES = "radialSpheres";
export const WORLD_RENDER_MODE_DEFAULT = WORLD_RENDER_MODE_FLAT2D;
export const WORLD_RENDER_MODE_OPTIONS = [WORLD_RENDER_MODE_FLAT2D, WORLD_RENDER_MODE_RADIAL_SPHERES, WORLD_RENDER_MODE_RADIAL];
export const WORLD_RENDER_MODE_LABELS = { flat2d: "2D", radialSpheres: "Radial spheres", radial: "Radial" };
export function normalizeWorldRenderMode(mode) {
    if (mode === WORLD_RENDER_MODE_FLAT2D || mode === WORLD_RENDER_MODE_RADIAL_SPHERES || mode === WORLD_RENDER_MODE_RADIAL) return mode;
    return WORLD_RENDER_MODE_DEFAULT;
}
