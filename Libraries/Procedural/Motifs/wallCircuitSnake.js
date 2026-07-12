import { BLEND_MODE_ADD } from "../../../Core/engineEnums.js";
import { SF_EVAL_X, SF_EVAL_Y, SF_WALL_V, SI_IS_WALL, applyTint, sampleRidged2D } from "../util/motifUtilities.js";
/**
 * Horizontal-ish circuit traces on walls. Uses world eval coords so the base edge
 * stays aligned with the floor; wallV is height (0 = floor seam).
 */
export const wallCircuitSnakeMotif = {
    metadata: {
        label: "Wall circuit snake",
        defaults: { type: "wallCircuitSnake", frequency: 0.022, threshold: 0.22, peak: 12, tint: [1.2, 0.35, 0.1], wiggleAmplitude: 24, octaves: 2, blendMode: BLEND_MODE_ADD },
        fields: [
            { path: "frequency", label: "Frequency", min: 0.005, max: 0.05, step: 0.001 },
            { path: "threshold", label: "Threshold", min: 0.05, max: 0.4, step: 0.01 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
            { path: "wiggleAmplitude", label: "Wiggle", min: 0, max: 48, step: 2 },
        ],
    },
    apply(sf, si, rf, ro, config, noise) {
        if (!si[SI_IS_WALL]) return;
        const x = sf[SF_EVAL_X] + (config.offset?.[0] ?? 0);
        const y = sf[SF_EVAL_Y] + (config.offset?.[1] ?? 0);
        const wallV = sf[SF_WALL_V];
        const wiggle = noise.sample2D(x * (config.wiggleFrequency ?? 0.012), wallV * (config.wiggleScale ?? 10), 2) * (config.wiggleAmplitude ?? 30);
        const along = (x + wiggle) * config.frequency;
        const across = wallV * (config.verticalScale ?? 0.12) + y * (config.worldVerticalDrift ?? 0.008);
        const value = config.ridged === false ? noise.sample2D(along, across, config.octaves ?? 2) : sampleRidged2D(noise, along, across, config.octaves ?? 2);
        if (value >= config.threshold) return;
        const intensity = (1.0 - value / config.threshold) * config.peak;
        applyTint(rf, ro, intensity, config.tint);
    },
};
