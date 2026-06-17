/** Default omnidirectional vision radius in grid tiles. */
export const LOS_SHADOW_VISION_TILES_DEFAULT = 16;
/** Viewer height above floor for shadow extrusion, in cell heights (ground-plane light). */
export const LOS_SHADOW_LIGHT_HEIGHT_CELLS_DEFAULT = 1;
/** Alpha of the dark overlay outside vision. */
export const LOS_SHADOW_OVERLAY_ALPHA = 0.82;
export function isLosShadowStructureMode(state) {
    return state?.losShadowMode === true || state?.editor?.losShadowActive === true;
}
