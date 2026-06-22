import { sampleCoords, applyTint, sampleRidged2D } from "../util/motifUtilities.js";
export const ridgeLinesMotif = {
    metadata: {
        label: "Ridge lines",
        defaults: { type: "ridgeLines", coordinateSpace: "eval", frequency: 0.02, threshold: 0.1, peak: 8, offset: [0, 0], tint: [0.2, 0.8, 1.2], octaves: 2, ridged: true, blendMode: "add" },
        fields: [
            { path: "frequency", label: "Frequency", min: 0.005, max: 0.06, step: 0.001 },
            { path: "threshold", label: "Threshold", min: 0, max: 0.3, step: 0.01 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
        ],
    },
    apply(sample, rgb, config) {
        const { x, y } = sampleCoords(sample, config.coordinateSpace);
        const [offsetX, offsetY] = config.offset ?? [0, 0];
        const nx = (x + offsetX) * config.frequency;
        const ny = (y + offsetY) * config.frequency;
        const value = config.ridged ? sampleRidged2D(sample.noise, nx, ny, config.octaves) : sample.noise.sample2D(nx, ny, config.octaves);
        if (value >= config.threshold) return;
        const intensity = (1.0 - value / config.threshold) * config.peak;
        applyTint(rgb, intensity, config.tint);
    },
};
