import { clampByte } from "../util/color.js";
import { noise2D } from "../Noise/Perlin2D.js";

function structureCoords(sample, structure) {
    const freqX = structure.frequencyX ?? structure.frequency;
    const freqY = structure.frequencyY ?? structure.frequency;
    return { x: sample.evalX * freqX, y: sample.evalY * freqY };
}

function grainCoords(sample, grain) {
    const freqX = grain.frequencyX ?? grain.frequency;
    const freqY = grain.frequencyY ?? grain.frequency;
    return { x: sample.evalX * freqX, y: sample.evalY * freqY };
}

export const baseMetalMotif = {
    apply(sample, rgb, config) {
        const { structure, grain } = config;
        const { x: sx, y: sy } = structureCoords(sample, structure);
        const structureNoise = noise2D(sx, sy, structure.octaves);
        rgb.r = clampByte(rgb.r + structureNoise * structure.rgbDelta[0]);
        rgb.g = clampByte(rgb.g + structureNoise * structure.rgbDelta[1]);
        rgb.b = clampByte(rgb.b + structureNoise * structure.rgbDelta[2]);

        const { x: gx, y: gy } = grainCoords(sample, grain);
        const fineNoise = noise2D(gx, gy, grain.octaves) * grain.amplitude;
        rgb.r = clampByte(rgb.r + fineNoise);
        rgb.g = clampByte(rgb.g + fineNoise);
        rgb.b = clampByte(rgb.b + fineNoise);
    },
};
