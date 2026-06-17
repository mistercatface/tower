/** Default omnidirectional vision radius in grid tiles. */
export const LOS_SHADOW_VISION_TILES_DEFAULT = 16;
/** Viewer height above floor for shadow extrusion, in cell heights (ground-plane light). */
export const LOS_SHADOW_LIGHT_HEIGHT_CELLS_DEFAULT = 1;
/** When the light sits below a wall top, extrude this far (BOIDS-style silhouette). */
export const LOS_SHADOW_MAX_EXTRUSION_RATIO = 100;
/** Alpha of the dark overlay outside vision. */
export const LOS_SHADOW_OVERLAY_ALPHA = 0.82;
export function isLosShadowStructureMode(state) {
    return state?.losShadowMode === true || state?.editor?.losShadowActive === true;
}
