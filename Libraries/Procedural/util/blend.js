import { clampByte } from "../../Color/colorMath.js";
import {
    BLEND_MODE_REPLACE,
    BLEND_MODE_ADD,
    BLEND_MODE_MULTIPLY,
    BLEND_MODE_SCREEN,
    BLEND_MODE_OVERLAY,
    BLEND_MODE_HARD_LIGHT,
    BLEND_MODE_SOFT_LIGHT,
    BLEND_MODE_COLOR_DODGE,
    BLEND_MODE_COLOR_BURN,
    BLEND_MODE_DIFFERENCE,
} from "../../../Core/engineEnums.js";

export const BLEND_OPTIONS = [
    { id: BLEND_MODE_REPLACE, label: "replace" },
    { id: BLEND_MODE_ADD, label: "add" },
    { id: BLEND_MODE_MULTIPLY, label: "multiply" },
    { id: BLEND_MODE_SCREEN, label: "screen" },
    { id: BLEND_MODE_OVERLAY, label: "overlay" },
    { id: BLEND_MODE_HARD_LIGHT, label: "hard-light" },
    { id: BLEND_MODE_SOFT_LIGHT, label: "soft-light" },
    { id: BLEND_MODE_COLOR_DODGE, label: "color-dodge" },
    { id: BLEND_MODE_COLOR_BURN, label: "color-burn" },
    { id: BLEND_MODE_DIFFERENCE, label: "difference" },
];

export function blendMotifRgb(out, outO, before, beforeO, after, afterO, blendMode) {
    const br = before[beforeO];
    const bg = before[beforeO + 1];
    const bb = before[beforeO + 2];
    const ar = after[afterO];
    const ag = after[afterO + 1];
    const ab = after[afterO + 2];
    if (blendMode === BLEND_MODE_REPLACE) {
        out[outO] = clampByte(ar);
        out[outO + 1] = clampByte(ag);
        out[outO + 2] = clampByte(ab);
        return;
    }
    let outR = ar;
    let outG = ag;
    let outB = ab;
    if (blendMode === BLEND_MODE_MULTIPLY) {
        outR = (br * ar) / 255;
        outG = (bg * ag) / 255;
        outB = (bb * ab) / 255;
    } else if (blendMode === BLEND_MODE_SCREEN) {
        outR = 255 - ((255 - br) * (255 - ar)) / 255;
        outG = 255 - ((255 - bg) * (255 - ag)) / 255;
        outB = 255 - ((255 - bb) * (255 - ab)) / 255;
    } else if (blendMode === BLEND_MODE_OVERLAY) {
        outR = br < 128 ? (2 * br * ar) / 255 : 255 - (2 * (255 - br) * (255 - ar)) / 255;
        outG = bg < 128 ? (2 * bg * ag) / 255 : 255 - (2 * (255 - bg) * (255 - ag)) / 255;
        outB = bb < 128 ? (2 * bb * ab) / 255 : 255 - (2 * (255 - bb) * (255 - ab)) / 255;
    } else if (blendMode === BLEND_MODE_HARD_LIGHT) {
        outR = ar < 128 ? (2 * br * ar) / 255 : 255 - (2 * (255 - br) * (255 - ar)) / 255;
        outG = ag < 128 ? (2 * bg * ag) / 255 : 255 - (2 * (255 - bg) * (255 - ag)) / 255;
        outB = ab < 128 ? (2 * bb * ab) / 255 : 255 - (2 * (255 - bb) * (255 - ab)) / 255;
    } else if (blendMode === BLEND_MODE_SOFT_LIGHT) {
        outR = ((255 - 2 * ar) * (br * br)) / 65025 + (2 * ar * br) / 255;
        outG = ((255 - 2 * ag) * (bg * bg)) / 65025 + (2 * ag * bg) / 255;
        outB = ((255 - 2 * ab) * (bb * bb)) / 65025 + (2 * ab * bb) / 255;
    } else if (blendMode === BLEND_MODE_COLOR_DODGE) {
        outR = ar === 255 ? 255 : Math.min(255, (br * 255) / (255 - ar));
        outG = ag === 255 ? 255 : Math.min(255, (bg * 255) / (255 - ag));
        outB = ab === 255 ? 255 : Math.min(255, (bb * 255) / (255 - ab));
    } else if (blendMode === BLEND_MODE_COLOR_BURN) {
        outR = ar === 0 ? 0 : 255 - Math.min(255, ((255 - br) * 255) / ar);
        outG = ag === 0 ? 0 : 255 - Math.min(255, ((255 - bg) * 255) / ag);
        outB = ab === 0 ? 0 : 255 - Math.min(255, ((255 - bb) * 255) / ab);
    } else if (blendMode === BLEND_MODE_DIFFERENCE) {
        outR = Math.abs(br - ar);
        outG = Math.abs(bg - ag);
        outB = Math.abs(bb - ab);
    } else if (blendMode === BLEND_MODE_ADD) {
        outR = br + ar;
        outG = bg + ag;
        outB = bb + ab;
    }
    out[outO] = clampByte(outR);
    out[outO + 1] = clampByte(outG);
    out[outO + 2] = clampByte(outB);
}
