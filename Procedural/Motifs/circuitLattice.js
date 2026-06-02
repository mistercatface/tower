import { clampByte } from "../util/color.js";
import { noise2D } from "../Noise/Perlin2D.js";

function sampleCoords(sample, coordinateSpace) {
    if (coordinateSpace === "warped") {
        return { x: sample.lookupX, y: sample.lookupY };
    }
    return { x: sample.evalX, y: sample.evalY };
}

function ridgedNoise(x, y, octaves) {
    return Math.abs(noise2D(x, y, octaves));
}

function applyTint(rgb, intensity, tint) {
    rgb.r = clampByte(rgb.r + intensity * tint[0]);
    rgb.g = clampByte(rgb.g + intensity * tint[1]);
    rgb.b = clampByte(rgb.b + intensity * tint[2]);
}

/**
 * Intersecting ridged veins form panel seams; glow concentrates on veins and brighter at crossings.
 */
export const circuitLatticeMotif = {
    apply(sample, rgb, config) {
        const { x, y } = sampleCoords(sample, config.coordinateSpace);
        const [offsetX, offsetY] = config.offset;
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
            applyTint(rgb, vein, config.tint);

            const crossGate = config.intersectionThreshold ?? ridgeThreshold;
            const crossA = Math.max(0, 1.0 - r1 / crossGate);
            const crossB = Math.max(0, 1.0 - r2 / crossGate);
            const cross = crossA * crossB;
            if (cross > 0 && config.intersectionPeak > 0) {
                applyTint(rgb, cross * config.intersectionPeak, config.intersectionTint);
            }
            return;
        }

        const grooveThreshold = config.grooveThreshold;
        if (grooveThreshold != null && lattice < grooveThreshold && config.grooveTint) {
            const groove = (1.0 - (lattice - ridgeThreshold) / (grooveThreshold - ridgeThreshold)) * (config.groovePeak ?? 4);
            applyTint(rgb, groove, config.grooveTint);
            return;
        }

        const interior = config.interiorVariation;
        if (interior) {
            const variation = noise2D(x * interior.frequency, y * interior.frequency, interior.octaves ?? 1);
            applyTint(rgb, variation * interior.amplitude, interior.tint);
        }
    },
};
