import { clampByte } from "../../Color/hex.js";
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
function compileBaseMetal(config) {
    const { structure, grain } = config;
    const structureFreqX = structure.frequencyX ?? structure.frequency;
    const structureFreqY = structure.frequencyY ?? structure.frequency;
    const structureOctaves = structure.octaves;
    const structureDeltaR = structure.rgbDelta[0];
    const structureDeltaG = structure.rgbDelta[1];
    const structureDeltaB = structure.rgbDelta[2];
    const grainFreqX = grain.frequencyX ?? grain.frequency;
    const grainFreqY = grain.frequencyY ?? grain.frequency;
    const grainOctaves = grain.octaves;
    const grainAmplitude = grain.amplitude;
    return (sample, rgb) => {
        const structureNoise = sample.noise.sample2D(sample.evalX * structureFreqX, sample.evalY * structureFreqY, structureOctaves);
        rgb.r = clampByte(rgb.r + structureNoise * structureDeltaR);
        rgb.g = clampByte(rgb.g + structureNoise * structureDeltaG);
        rgb.b = clampByte(rgb.b + structureNoise * structureDeltaB);
        const fineNoise = sample.noise.sample2D(sample.evalX * grainFreqX, sample.evalY * grainFreqY, grainOctaves) * grainAmplitude;
        rgb.r = clampByte(rgb.r + fineNoise);
        rgb.g = clampByte(rgb.g + fineNoise);
        rgb.b = clampByte(rgb.b + fineNoise);
    };
}
export const baseMetalMotif = {
    metadata: {
        label: "Base metal",
        defaults: { type: "baseMetal", structure: { frequency: 0.0025, octaves: 1, rgbDelta: [3, 3, 4] }, grain: { frequency: 0.18, octaves: 1, amplitude: 1 }, blendMode: "add" },
        fields: [
            { path: "structure.frequency", label: "Structure freq", min: 0.0005, max: 0.02, step: 0.0005 },
            { path: "structure.octaves", label: "Structure octaves", min: 1, max: 4, step: 1 },
            { path: "structure.rgbDelta.0", label: "Struct R Δ", min: -12, max: 12, step: 1 },
            { path: "structure.rgbDelta.1", label: "Struct G Δ", min: -12, max: 12, step: 1 },
            { path: "structure.rgbDelta.2", label: "Struct B Δ", min: -12, max: 12, step: 1 },
            { path: "grain.frequency", label: "Grain freq", min: 0.05, max: 2, step: 0.05 },
            { path: "grain.amplitude", label: "Grain amp", min: 0, max: 6, step: 0.5 },
        ],
    },
    apply(sample, rgb, config) {
        const { structure, grain } = config;
        const { x: sx, y: sy } = structureCoords(sample, structure);
        const structureNoise = sample.noise.sample2D(sx, sy, structure.octaves);
        rgb.r = clampByte(rgb.r + structureNoise * structure.rgbDelta[0]);
        rgb.g = clampByte(rgb.g + structureNoise * structure.rgbDelta[1]);
        rgb.b = clampByte(rgb.b + structureNoise * structure.rgbDelta[2]);
        const { x: gx, y: gy } = grainCoords(sample, grain);
        const fineNoise = sample.noise.sample2D(gx, gy, grain.octaves) * grain.amplitude;
        rgb.r = clampByte(rgb.r + fineNoise);
        rgb.g = clampByte(rgb.g + fineNoise);
        rgb.b = clampByte(rgb.b + fineNoise);
    },
    compile: compileBaseMetal,
};
