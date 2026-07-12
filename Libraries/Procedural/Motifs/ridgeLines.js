import { BLEND_MODE_ADD, COORD_SPACE_EVAL } from "../../../Core/engineEnums.js";
import { sampleCoordX, sampleCoordY, applyTint, sampleRidged2D } from "../util/motifUtilities.js";
export const ridgeLinesMotif = {
    metadata: {
        label: "Ridge lines",
        defaults: { type: "ridgeLines", coordinateSpace: COORD_SPACE_EVAL, frequency: 0.02, threshold: 0.1, peak: 8, offset: [0, 0], tint: [0.2, 0.8, 1.2], octaves: 2, ridged: true, blendMode: BLEND_MODE_ADD },
        fields: [
            { path: "frequency", label: "Frequency", min: 0.005, max: 0.06, step: 0.001 },
            { path: "threshold", label: "Threshold", min: 0, max: 0.3, step: 0.01 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
        ]},
    apply(sf, si, rf, ro, config, noise) {
        const x = sampleCoordX(sf, config.coordinateSpace);
        const y = sampleCoordY(sf, config.coordinateSpace);
        const [offsetX, offsetY] = config.offset ?? [0, 0];
        const nx = (x + offsetX) * config.frequency;
        const ny = (y + offsetY) * config.frequency;
        const value = config.ridged ? sampleRidged2D(noise, nx, ny, config.octaves) : noise.sample2D(nx, ny, config.octaves);
        if (value >= config.threshold) return;
        const intensity = (1.0 - value / config.threshold) * config.peak;
        applyTint(rf, ro, intensity, config.tint);
    }};
