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

    let outR = after.r;
    let outG = after.g;
    let outB = after.b;

    if (blendMode === "multiply") {
        outR = (before.r * after.r) / 255;
        outG = (before.g * after.g) / 255;
        outB = (before.b * after.b) / 255;
    } else if (blendMode === "screen") {
        outR = 255 - ((255 - before.r) * (255 - after.r) / 255);
        outG = 255 - ((255 - before.g) * (255 - after.g) / 255);
        outB = 255 - ((255 - before.b) * (255 - after.b) / 255);
    } else if (blendMode === "overlay") {
        outR = before.r < 128 ? (2 * before.r * after.r / 255) : (255 - 2 * (255 - before.r) * (255 - after.r) / 255);
        outG = before.g < 128 ? (2 * before.g * after.g / 255) : (255 - 2 * (255 - before.g) * (255 - after.g) / 255);
        outB = before.b < 128 ? (2 * before.b * after.b / 255) : (255 - 2 * (255 - before.b) * (255 - after.b) / 255);
    } else if (blendMode === "hard-light") {
        outR = after.r < 128 ? (2 * before.r * after.r / 255) : (255 - 2 * (255 - before.r) * (255 - after.r) / 255);
        outG = after.g < 128 ? (2 * before.g * after.g / 255) : (255 - 2 * (255 - before.g) * (255 - after.g) / 255);
        outB = after.b < 128 ? (2 * before.b * after.b / 255) : (255 - 2 * (255 - before.b) * (255 - after.b) / 255);
    } else if (blendMode === "soft-light") {
        outR = ((255 - 2 * after.r) * (before.r * before.r) / 65025) + (2 * after.r * before.r / 255);
        outG = ((255 - 2 * after.g) * (before.g * before.g) / 65025) + (2 * after.g * before.g / 255);
        outB = ((255 - 2 * after.b) * (before.b * before.b) / 65025) + (2 * after.b * before.b / 255);
    } else if (blendMode === "color-dodge") {
        outR = after.r === 255 ? 255 : Math.min(255, (before.r * 255) / (255 - after.r));
        outG = after.g === 255 ? 255 : Math.min(255, (before.g * 255) / (255 - after.g));
        outB = after.b === 255 ? 255 : Math.min(255, (before.b * 255) / (255 - after.b));
    } else if (blendMode === "color-burn") {
        outR = after.r === 0 ? 0 : 255 - Math.min(255, ((255 - before.r) * 255) / after.r);
        outG = after.g === 0 ? 0 : 255 - Math.min(255, ((255 - before.g) * 255) / after.g);
        outB = after.b === 0 ? 0 : 255 - Math.min(255, ((255 - before.b) * 255) / after.b);
    } else if (blendMode === "difference") {
        outR = Math.abs(before.r - after.r);
        outG = Math.abs(before.g - after.g);
        outB = Math.abs(before.b - after.b);
    } else if (blendMode === "add") {
        outR = before.r + after.r;
        outG = before.g + after.g;
        outB = before.b + after.b;
    }

    return {
        r: clampByte(before.r * (1 - t) + outR * t),
        g: clampByte(before.g * (1 - t) + outG * t),
        b: clampByte(before.b * (1 - t) + outB * t),
    };
}
