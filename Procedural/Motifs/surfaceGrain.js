import { clampByte } from "../util/color.js";
import { noise2D } from "../Noise/Perlin2D.js";

export const surfaceGrainMotif = {
    apply(sample, rgb, config) {
        const freq = config.frequency;
        let nx = sample.evalX;
        let ny = sample.evalY;
        if (config.axis === "horizontal") {
            ny *= config.axisStretch ?? 0.25;
        } else if (config.axis === "vertical") {
            nx *= config.axisStretch ?? 0.25;
        }
        const grain = noise2D(nx * freq, ny * freq, config.octaves ?? 1) * config.amplitude;
        rgb.r = clampByte(rgb.r + grain * config.tint[0]);
        rgb.g = clampByte(rgb.g + grain * config.tint[1]);
        rgb.b = clampByte(rgb.b + grain * config.tint[2]);
    },
};
