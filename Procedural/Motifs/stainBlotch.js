import { clampByte } from "../util/color.js";
import { noise2D } from "../Noise/Perlin2D.js";

function sampleCoords(sample, coordinateSpace) {
    if (coordinateSpace === "warped") {
        return { x: sample.lookupX, y: sample.lookupY };
    }
    return { x: sample.evalX, y: sample.evalY };
}

export const stainBlotchMotif = {
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
