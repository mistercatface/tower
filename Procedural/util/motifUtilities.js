import { clampByte } from "./color.js";

/**
 * Resolves local coordinates based on the coordinate space option.
 * @param {{ evalX: number, evalY: number, lookupX: number, lookupY: number }} sample
 * @param {"eval"|"warped"} [coordinateSpace]
 * @returns {{ x: number, y: number }}
 */
export function sampleCoords(sample, coordinateSpace) {
    if (coordinateSpace === "warped") {
        return { x: sample.lookupX, y: sample.lookupY };
    }
    return { x: sample.evalX, y: sample.evalY };
}

/**
 * Adds an intensity-scaled RGB tint to the pixel color with clamping.
 * @param {{ r: number, g: number, b: number }} rgb
 * @param {number} intensity
 * @param {[number, number, number]} tint
 */
export function applyTint(rgb, intensity, tint) {
    rgb.r = clampByte(rgb.r + intensity * tint[0]);
    rgb.g = clampByte(rgb.g + intensity * tint[1]);
    rgb.b = clampByte(rgb.b + intensity * tint[2]);
}
