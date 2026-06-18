import { clampByte, hexToRgb, rgbToHex } from "./hex.js";
import { collectHexColors, remapHexColors } from "./hueShift.js";
export function scaleHexBrightness(hex, factor) {
    if (factor === 1) return hex;
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(clampByte(r * factor), clampByte(g * factor), clampByte(b * factor));
}
export function scaleColorTreeBrightness(colorTree, factor) {
    if (factor === 1 || colorTree == null) return colorTree;
    const hexes = [];
    collectHexColors(colorTree, hexes);
    if (!hexes.length) return colorTree;
    const scaled = hexes.map((hex) => scaleHexBrightness(hex, factor));
    return remapHexColors(colorTree, scaled);
}
