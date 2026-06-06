import { noise2D } from "../Noise/Perlin2D.js";
import { sampleCoords, applyTint } from "../util/motifUtilities.js";
function ridgedNoise(x, y, octaves) {
    return Math.abs(noise2D(x, y, octaves));
}
/**
 * Intersecting ridged veins form panel seams; glow concentrates on veins and brighter at crossings.
 */
export const circuitLatticeMotif = {
    metadata: {
        label: "Circuit lattice",
        defaults: {
            type: "circuitLattice",
            coordinateSpace: "warped",
            frequency: 0.016,
            octaves: 2,
            angle: 0.15,
            offset: [0, 0],
            ridgeThreshold: 0.11,
            peak: 10,
            tint: [0.4, 0.5, 0.9],
            intersectionThreshold: 0.12,
            intersectionPeak: 12,
            intersectionTint: [0.5, 1.2, 1.8],
            opacity: 0.55,
            blendMode: "add",
        },
        fields: [
            { path: "frequency", label: "Frequency", min: 0.005, max: 0.04, step: 0.001 },
            { path: "angle", label: "Angle", min: 0, max: 1.57, step: 0.05 },
            { path: "ridgeThreshold", label: "Vein threshold", min: 0.05, max: 0.25, step: 0.01 },
            { path: "peak", label: "Vein peak", min: 0, max: 20, step: 1 },
            { path: "intersectionPeak", label: "Cross peak", min: 0, max: 20, step: 1 },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
    apply(sample, rgb, config) {
        const { x, y } = sampleCoords(sample, config.coordinateSpace);
        const [offsetX, offsetY] = config.offset ?? [0, 0];
        const freq = config.frequency;
        const octaves = config.octaves;
        const angle = config.angle ?? 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const ax = x * cos - y * sin;
        const ay = x * sin + y * cos;
        const r1 = ridgedNoise((ax + offsetX) * freq, (ay + offsetY) * freq, octaves);
        const r2 = ridgedNoise((ay + offsetX) * freq, (ax + offsetY) * freq, octaves);
        const lattice = Math.min(r1, r2);
        const ridgeThreshold = config.ridgeThreshold;
        if (lattice < ridgeThreshold) {
            const vein = (1.0 - lattice / ridgeThreshold) * config.peak;
            if (config.tint) applyTint(rgb, vein, config.tint);
            const crossGate = config.intersectionThreshold ?? ridgeThreshold;
            const crossA = Math.max(0, 1.0 - r1 / crossGate);
            const crossB = Math.max(0, 1.0 - r2 / crossGate);
            const cross = crossA * crossB;
            if (cross > 0 && config.intersectionPeak > 0 && config.intersectionTint) applyTint(rgb, cross * config.intersectionPeak, config.intersectionTint);
            return;
        }
        const grooveThreshold = config.grooveThreshold;
        if (grooveThreshold != null && lattice < grooveThreshold && config.grooveTint) {
            const groove = (1.0 - (lattice - ridgeThreshold) / (grooveThreshold - ridgeThreshold)) * (config.groovePeak ?? 4);
            applyTint(rgb, groove, config.grooveTint);
            return;
        }
        const interior = config.interiorVariation;
        if (interior && interior.tint) {
            const variation = noise2D(x * interior.frequency, y * interior.frequency, interior.octaves ?? 1);
            applyTint(rgb, variation * interior.amplitude, interior.tint);
        }
    },
};
