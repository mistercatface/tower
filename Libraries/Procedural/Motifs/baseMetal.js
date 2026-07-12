import { clampByte } from "../../Color/colorMath.js";
import { SF_EVAL_X, SF_EVAL_Y, RF_R, RF_G, RF_B } from "../util/motifUtilities.js";
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
    return (sf, si, rf, ro, noise) => {
        const structureNoise = noise.sample2D(sf[SF_EVAL_X] * structureFreqX, sf[SF_EVAL_Y] * structureFreqY, structureOctaves);
        rf[ro + RF_R] = clampByte(rf[ro + RF_R] + structureNoise * structureDeltaR);
        rf[ro + RF_G] = clampByte(rf[ro + RF_G] + structureNoise * structureDeltaG);
        rf[ro + RF_B] = clampByte(rf[ro + RF_B] + structureNoise * structureDeltaB);
        const fineNoise = noise.sample2D(sf[SF_EVAL_X] * grainFreqX, sf[SF_EVAL_Y] * grainFreqY, grainOctaves) * grainAmplitude;
        rf[ro + RF_R] = clampByte(rf[ro + RF_R] + fineNoise);
        rf[ro + RF_G] = clampByte(rf[ro + RF_G] + fineNoise);
        rf[ro + RF_B] = clampByte(rf[ro + RF_B] + fineNoise);
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
    apply(sf, si, rf, ro, config, noise) {
        const { structure, grain } = config;
        const structureFreqX = structure.frequencyX ?? structure.frequency;
        const structureFreqY = structure.frequencyY ?? structure.frequency;
        const structureNoise = noise.sample2D(sf[SF_EVAL_X] * structureFreqX, sf[SF_EVAL_Y] * structureFreqY, structure.octaves);
        rf[ro + RF_R] = clampByte(rf[ro + RF_R] + structureNoise * structure.rgbDelta[0]);
        rf[ro + RF_G] = clampByte(rf[ro + RF_G] + structureNoise * structure.rgbDelta[1]);
        rf[ro + RF_B] = clampByte(rf[ro + RF_B] + structureNoise * structure.rgbDelta[2]);
        const grainFreqX = grain.frequencyX ?? grain.frequency;
        const grainFreqY = grain.frequencyY ?? grain.frequency;
        const fineNoise = noise.sample2D(sf[SF_EVAL_X] * grainFreqX, sf[SF_EVAL_Y] * grainFreqY, grain.octaves) * grain.amplitude;
        rf[ro + RF_R] = clampByte(rf[ro + RF_R] + fineNoise);
        rf[ro + RF_G] = clampByte(rf[ro + RF_G] + fineNoise);
        rf[ro + RF_B] = clampByte(rf[ro + RF_B] + fineNoise);
    },
    compile: compileBaseMetal,
};
