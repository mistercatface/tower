import { sampleCoordX, sampleCoordY, applyTint } from "../util/motifUtilities.js";
export const stainBlotchMotif = {
    metadata: {
        label: "Stain blotch",
        defaults: { type: "stainBlotch", coordinateSpace: "eval", frequency: 0.008, threshold: 0.55, peak: 5, offset: [0, 0], tint: [1, 2, 2], octaves: 1, blendMode: "add" },
        fields: [
            { path: "frequency", label: "Frequency", min: 0.002, max: 0.05, step: 0.001 },
            { path: "threshold", label: "Threshold", min: 0, max: 0.9, step: 0.05 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
        ],
    },
    apply(sf, si, rf, ro, config, noise) {
        const x = sampleCoordX(sf, config.coordinateSpace);
        const y = sampleCoordY(sf, config.coordinateSpace);
        const [offsetX, offsetY] = config.offset ?? [0, 0];
        const value = noise.sample2D((x + offsetX) * config.frequency, (y + offsetY) * config.frequency, config.octaves);
        if (value <= config.threshold) return;
        const span = 1.0 - config.threshold;
        const intensity = ((value - config.threshold) / span) * config.peak;
        applyTint(rf, ro, intensity, config.tint);
    },
};
