import { clampByte } from "../util/color.js";
import { noise2D } from "../Noise/Perlin2D.js";

/**
 * Horizontal-ish circuit traces on walls. Uses world eval coords so the base edge
 * stays aligned with the floor; wallV is height (0 = floor seam).
 */
export const wallCircuitSnakeMotif = {
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
        rgb.r = clampByte(rgb.r + intensity * config.tint[0]);
        rgb.g = clampByte(rgb.g + intensity * config.tint[1]);
        rgb.b = clampByte(rgb.b + intensity * config.tint[2]);
    },
};
