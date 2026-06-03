import { noise2D } from "../Noise/Perlin2D.js";
import { applyTint } from "../util/motifUtilities.js";

/**
 * Horizontal-ish circuit traces on walls. Uses world eval coords so the base edge
 * stays aligned with the floor; wallV is height (0 = floor seam).
 */
export const wallCircuitSnakeMotif = {
    metadata: {
        label: "Wall circuit snake",
        defaults: {
            type: "wallCircuitSnake",
            frequency: 0.022,
            threshold: 0.22,
            peak: 12,
            tint: [1.2, 0.35, 0.1],
            wiggleAmplitude: 24,
            octaves: 2,
            opacity: 0.7,
            blendMode: "add",
        },
        fields: [
            { path: "frequency", label: "Frequency", min: 0.005, max: 0.05, step: 0.001 },
            { path: "threshold", label: "Threshold", min: 0.05, max: 0.4, step: 0.01 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
            { path: "wiggleAmplitude", label: "Wiggle", min: 0, max: 48, step: 2 },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
    apply(sample, rgb, config) {
        if (!sample.isWall) {
            return;
        }

        const x = sample.evalX + (config.offset?.[0] ?? 0);
        const y = sample.evalY + (config.offset?.[1] ?? 0);
        const wallV = sample.wallV ?? 0;

        const wiggle =
            noise2D(x * (config.wiggleFrequency ?? 0.012), wallV * (config.wiggleScale ?? 10), 2) *
            (config.wiggleAmplitude ?? 30);
        const along = (x + wiggle) * config.frequency;
        const across = wallV * (config.verticalScale ?? 0.12) + y * (config.worldVerticalDrift ?? 0.008);

        let value = noise2D(along, across, config.octaves ?? 2);
        if (config.ridged !== false) {
            value = Math.abs(value);
        }

        if (value >= config.threshold) {
            return;
        }

        const intensity = (1.0 - value / config.threshold) * config.peak;
        applyTint(rgb, intensity, config.tint);
    },
};
