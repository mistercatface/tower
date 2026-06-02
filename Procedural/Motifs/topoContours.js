import { clampByte } from "../util/color.js";
import { noise2D } from "../Noise/Perlin2D.js";

function sampleCoords(sample, coordinateSpace) {
    if (coordinateSpace === "warped") {
        return { x: sample.lookupX, y: sample.lookupY };
    }
    return { x: sample.evalX, y: sample.evalY };
}

function applyTint(rgb, intensity, tint) {
    rgb.r = clampByte(rgb.r + intensity * tint[0]);
    rgb.g = clampByte(rgb.g + intensity * tint[1]);
    rgb.b = clampByte(rgb.b + intensity * tint[2]);
}

/**
 * Topographical contour lines based on noise. When warped, looks like terraced armor plating or holographic fingerprint ridges.
 */
export const topoContoursMotif = {
    apply(sample, rgb, config) {
        const { x, y } = sampleCoords(sample, config.coordinateSpace);
        
        const noiseVal = noise2D(
            x * config.frequency + (config.offset?.[0] ?? 0),
            y * config.frequency + (config.offset?.[1] ?? 0),
            config.octaves ?? 2
        );
        
        const normalizedNoise = (noiseVal + 1) / 2; // ~0 to 1
        
        const bandPhase = normalizedNoise * config.bands;
        const distToBand = Math.abs(bandPhase - Math.round(bandPhase));
        const thickness = config.thickness ?? 0.1;
        
        if (distToBand < thickness) {
            const intensity = (1.0 - distToBand / thickness) * config.peak;
            applyTint(rgb, intensity, config.tint ?? [1, 1, 1]);
        }
    },
};
