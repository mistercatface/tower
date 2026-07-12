import { clampByte } from "../../Color/colorMath.js";
export const BLEND_OPTIONS = ["replace", "add", "multiply", "screen", "overlay", "hard-light", "soft-light", "color-dodge", "color-burn", "difference"];
export function blendMotifRgb(out, outO, before, beforeO, after, afterO, blendMode) {
    const br = before[beforeO];
    const bg = before[beforeO + 1];
    const bb = before[beforeO + 2];
    const ar = after[afterO];
    const ag = after[afterO + 1];
    const ab = after[afterO + 2];
    if (blendMode === "replace") {
        out[outO] = clampByte(ar);
        out[outO + 1] = clampByte(ag);
        out[outO + 2] = clampByte(ab);
        return;
    }
    let outR = ar;
    let outG = ag;
    let outB = ab;
    if (blendMode === "multiply") {
        outR = (br * ar) / 255;
        outG = (bg * ag) / 255;
        outB = (bb * ab) / 255;
    } else if (blendMode === "screen") {
        outR = 255 - ((255 - br) * (255 - ar)) / 255;
        outG = 255 - ((255 - bg) * (255 - ag)) / 255;
        outB = 255 - ((255 - bb) * (255 - ab)) / 255;
    } else if (blendMode === "overlay") {
        outR = br < 128 ? (2 * br * ar) / 255 : 255 - (2 * (255 - br) * (255 - ar)) / 255;
        outG = bg < 128 ? (2 * bg * ag) / 255 : 255 - (2 * (255 - bg) * (255 - ag)) / 255;
        outB = bb < 128 ? (2 * bb * ab) / 255 : 255 - (2 * (255 - bb) * (255 - ab)) / 255;
    } else if (blendMode === "hard-light") {
        outR = ar < 128 ? (2 * br * ar) / 255 : 255 - (2 * (255 - br) * (255 - ar)) / 255;
        outG = ag < 128 ? (2 * bg * ag) / 255 : 255 - (2 * (255 - bg) * (255 - ag)) / 255;
        outB = ab < 128 ? (2 * bb * ab) / 255 : 255 - (2 * (255 - bb) * (255 - ab)) / 255;
    } else if (blendMode === "soft-light") {
        outR = ((255 - 2 * ar) * (br * br)) / 65025 + (2 * ar * br) / 255;
        outG = ((255 - 2 * ag) * (bg * bg)) / 65025 + (2 * ag * bg) / 255;
        outB = ((255 - 2 * ab) * (bb * bb)) / 65025 + (2 * ab * bb) / 255;
    } else if (blendMode === "color-dodge") {
        outR = ar === 255 ? 255 : Math.min(255, (br * 255) / (255 - ar));
        outG = ag === 255 ? 255 : Math.min(255, (bg * 255) / (255 - ag));
        outB = ab === 255 ? 255 : Math.min(255, (bb * 255) / (255 - ab));
    } else if (blendMode === "color-burn") {
        outR = ar === 0 ? 0 : 255 - Math.min(255, ((255 - br) * 255) / ar);
        outG = ag === 0 ? 0 : 255 - Math.min(255, ((255 - bg) * 255) / ag);
        outB = ab === 0 ? 0 : 255 - Math.min(255, ((255 - bb) * 255) / ab);
    } else if (blendMode === "difference") {
        outR = Math.abs(br - ar);
        outG = Math.abs(bg - ag);
        outB = Math.abs(bb - ab);
    } else if (blendMode === "add") {
        outR = br + ar;
        outG = bg + ag;
        outB = bb + ab;
    }
    out[outO] = clampByte(outR);
    out[outO + 1] = clampByte(outG);
    out[outO + 2] = clampByte(outB);
}
