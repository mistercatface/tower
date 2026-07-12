import { sampleCoordX, sampleCoordY, applyTint } from "../util/motifUtilities.js";
function fbmRidged(x, y, octaves, noise) {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    for (let i = 0; i < octaves; i++) {
        let n = noise.sample2D(x * freq, y * freq, 1);
        n = 1.0 - Math.abs(n);
        // Sharpen the ridge
        n = n * n;
        sum += n * amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    return sum;
}
export const fractalCracksMotif = {
    metadata: {
        label: "Fractal cracks",
        defaults: { type: "fractalCracks", coordinateSpace: "eval", frequency: 0.01, octaves: 3, threshold: 0.7, peak: 10, offset: [0, 0], tint: [1, 1, 1], blendMode: "add" },
        fields: [
            { path: "frequency", label: "Frequency", min: 0.005, max: 0.05, step: 0.001 },
            { path: "octaves", label: "Octaves", min: 1, max: 6, step: 1 },
            { path: "threshold", label: "Threshold", min: 0.1, max: 0.95, step: 0.01 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
            { path: "tint.0", label: "Tint R", min: -5, max: 5, step: 0.1 },
            { path: "tint.1", label: "Tint G", min: -5, max: 5, step: 0.1 },
            { path: "tint.2", label: "Tint B", min: -5, max: 5, step: 0.1 },
        ],
    },
    apply(sf, si, rf, ro, config, noise) {
        const x = sampleCoordX(sf, config.coordinateSpace);
        const y = sampleCoordY(sf, config.coordinateSpace);
        const freq = config.frequency ?? 0.01;
        const octaves = config.octaves ?? 3;
        const [ox, oy] = config.offset ?? [0, 0];
        const v = fbmRidged((x + ox) * freq, (y + oy) * freq, octaves, noise);
        const threshold = config.threshold ?? 0.8;
        if (v < threshold) return;
        // Normalize 0 to 1 over the ridge peak
        let t = (v - threshold) / (1 - threshold);
        // Apply edge smoothstep
        t = t * t * (3 - 2 * t);
        applyTint(rf, ro, -t * (config.peak ?? 10), config.tint ?? [1, 1, 1]);
    },
};
