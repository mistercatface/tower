import { clampByte } from "../util/color.js";
import { noise2D } from "../Noise/Perlin2D.js";

export const baseMetalMotif = {
    apply(sample, rgb, config) {
        const { structure, grain } = config;
        const structureNoise = noise2D(
            sample.evalX * structure.frequency,
            sample.evalY * structure.frequency,
            structure.octaves
        );
        rgb.r = clampByte(rgb.r + structureNoise * structure.rgbDelta[0]);
        rgb.g = clampByte(rgb.g + structureNoise * structure.rgbDelta[1]);
        rgb.b = clampByte(rgb.b + structureNoise * structure.rgbDelta[2]);

        const fineNoise =
            noise2D(sample.evalX * grain.frequency, sample.evalY * grain.frequency, grain.octaves) *
            grain.amplitude;
        rgb.r = clampByte(rgb.r + fineNoise);
        rgb.g = clampByte(rgb.g + fineNoise);
        rgb.b = clampByte(rgb.b + fineNoise);
    },
};
