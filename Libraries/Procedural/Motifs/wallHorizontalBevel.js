import { BLEND_MODE_ADD } from "../../../Core/engineEnums.js";
import { SF_WALL_U, SF_WALL_V, SF_SEED, SI_IS_WALL, applyTint } from "../util/motifUtilities.js";
function snakeOffset(wallU, bandIndex, seed, config, spacing, noise) {
    const wobble = noise.sample2D(wallU * (config.snakeAlong ?? 2.5) + seed * 0.001, bandIndex * 0.41, config.snakeOctaves ?? 2);
    return (wobble - 0.5) * 2 * (config.snakeStrength ?? 0.35) * spacing;
}
/**
 * Even horizontal ribs across a wall face (wallU/wallV), with a slow snake along the wall.
 * wallV: 0 = floor seam, 1 = top. wallU: 0..1 along the wall edge.
 */
export const wallHorizontalBevelMotif = {
    metadata: {
        label: "Wall panel ribs",
        defaults: { type: "wallHorizontalBevel", bands: 8, ribFill: 0.55, highlightPeak: 8, shadowPeak: 10, coreWidth: 0.2, corePeak: 6, coreTint: [0.4, 1.0, 1.6], snakeStrength: 0.25, blendMode: BLEND_MODE_ADD },
        fields: [
            { path: "bands", label: "Band count", min: 3, max: 16, step: 1 },
            { path: "ribFill", label: "Rib fill", min: 0.2, max: 0.9, step: 0.05 },
            { path: "highlightPeak", label: "Highlight", min: 0, max: 16, step: 1 },
            { path: "shadowPeak", label: "Shadow", min: 0, max: 16, step: 1 },
            { path: "corePeak", label: "Core glow", min: 0, max: 12, step: 1 },
        ],
    },
    apply(sf, si, rf, ro, config, noise) {
        if (!si[SI_IS_WALL]) return;
        const bandCount = config.bands ?? 10;
        const spacing = 1 / bandCount;
        const wallV = sf[SF_WALL_V];
        const bandIndex = Math.floor(wallV / spacing);
        const bandCenter = (bandIndex + 0.5) * spacing;
        const snake = snakeOffset(sf[SF_WALL_U], bandIndex, sf[SF_SEED], config, spacing, noise);
        const centerV = bandCenter + snake;
        const ribHalf = spacing * (config.ribFill ?? 0.5) * 0.5;
        const dist = Math.abs(wallV - centerV);
        if (dist >= ribHalf) return;
        const rel = (wallV - centerV) / ribHalf;
        const edge = 1 - Math.abs(rel);
        const bevel = edge * edge;
        if (rel < 0) {
            const peak = config.highlightPeak ?? 9;
            applyTint(rf, ro, bevel * peak, [1, 1, config.coolBias ?? 1.05]);
        } else {
            const peak = config.shadowPeak ?? 11;
            applyTint(rf, ro, -bevel * peak, [1, 1, config.coolBias ?? 1.05]);
        }
        const coreWidth = config.coreWidth ?? 0.18;
        if (Math.abs(rel) < coreWidth) {
            const core = (1 - Math.abs(rel) / coreWidth) * (config.corePeak ?? 5);
            applyTint(rf, ro, core, config.coreTint ?? [0.3, 1.1, 1.7]);
        }
    },
};
