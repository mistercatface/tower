import { clampByte } from "../util/color.js";
import { noise2D } from "../Noise/Perlin2D.js";

function sampleCoords(sample, coordinateSpace) {
    if (coordinateSpace === "warped") {
        return { x: sample.lookupX, y: sample.lookupY };
    }
    return { x: sample.evalX, y: sample.evalY };
}

export const ridgeLinesMotif = {
    metadata: {
        label: "Ridge lines",
        defaults: {
            type: "ridgeLines",
            coordinateSpace: "eval",
            frequency: 0.02,
            threshold: 0.1,
            peak: 8,
            offset: [0, 0],
            tint: [0.2, 0.8, 1.2],
            octaves: 2,
            ridged: true,
            opacity: 0.35,
            blendMode: "add",
        },
        fields: [
            { path: "frequency", label: "Frequency", min: 0.005, max: 0.06, step: 0.001 },
            { path: "threshold", label: "Threshold", min: 0, max: 0.3, step: 0.01 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
    apply(sample, rgb, config) {
        const { x, y } = sampleCoords(sample, config.coordinateSpace);
        const [offsetX, offsetY] = config.offset ?? [0, 0];
        let value = noise2D(
            (x + offsetX) * config.frequency,
            (y + offsetY) * config.frequency,
            config.octaves
        );
        if (config.ridged) {
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
