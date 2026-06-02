import { clampByte } from "../util/color.js";
import { noise2D } from "../Noise/Perlin2D.js";

function sampleCoords(sample, coordinateSpace) {
    if (coordinateSpace === "warped") {
        return { x: sample.lookupX, y: sample.lookupY };
    }
    return { x: sample.evalX, y: sample.evalY };
}

export const stainBlotchMotif = {
    metadata: {
        label: "Stain blotch",
        defaults: {
            type: "stainBlotch",
            coordinateSpace: "eval",
            frequency: 0.008,
            threshold: 0.55,
            peak: 5,
            offset: [0, 0],
            tint: [1, 2, 2],
            octaves: 1,
            opacity: 0.15,
            blendMode: "add",
        },
        fields: [
            { path: "frequency", label: "Frequency", min: 0.002, max: 0.05, step: 0.001 },
            { path: "threshold", label: "Threshold", min: 0, max: 0.9, step: 0.05 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
    apply(sample, rgb, config) {
        const { x, y } = sampleCoords(sample, config.coordinateSpace);
        const [offsetX, offsetY] = config.offset;
        const value = noise2D(
            (x + offsetX) * config.frequency,
            (y + offsetY) * config.frequency,
            config.octaves
        );
        if (value <= config.threshold) {
            return;
        }
        const span = 1.0 - config.threshold;
        const intensity = ((value - config.threshold) / span) * config.peak;
        rgb.r = clampByte(rgb.r + intensity * config.tint[0]);
        rgb.g = clampByte(rgb.g + intensity * config.tint[1]);
        rgb.b = clampByte(rgb.b + intensity * config.tint[2]);
    },
};
