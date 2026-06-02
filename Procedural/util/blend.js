import { clampByte } from "./color.js";

/** @typedef {"add" | "multiply" | "replace"} MotifBlendMode */

/**
 * @param {{ r: number, g: number, b: number }} before
 * @param {{ r: number, g: number, b: number }} after
 * @param {MotifBlendMode} blendMode
 * @param {number} opacity
 */
export function blendMotifRgb(before, after, blendMode, opacity) {
    const t = Math.max(0, Math.min(1, opacity ?? 1));
    if (t <= 0) {
        return before;
    }

    if (blendMode === "replace") {
        return {
            r: clampByte(before.r * (1 - t) + after.r * t),
            g: clampByte(before.g * (1 - t) + after.g * t),
            b: clampByte(before.b * (1 - t) + after.b * t),
        };
    }

    if (blendMode === "multiply") {
        return {
            r: clampByte(before.r * (1 - t) + (before.r * after.r) / 255 * t),
            g: clampByte(before.g * (1 - t) + (before.g * after.g) / 255 * t),
            b: clampByte(before.b * (1 - t) + (before.b * after.b) / 255 * t),
        };
    }

    return {
        r: clampByte(before.r + (after.r - before.r) * t),
        g: clampByte(before.g + (after.g - before.g) * t),
        b: clampByte(before.b + (after.b - before.b) * t),
    };
}
