import { hexToHue, hexToRgb, hslToHex, normalizeHue, rgbToHsl } from "./hex.js";
function shortestHueShift(fromHue, toHue) {
    let shift = toHue - fromHue;
    while (shift > 180) shift -= 360;
    while (shift < -180) shift += 360;
    return shift;
}
export function collectHexColors(value, out) {
    if (typeof value === "string" && value.startsWith("#")) {
        out.push(value);
        return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) collectHexColors(value[i], out);
        return;
    }
    for (const key of Object.keys(value)) collectHexColors(value[key], out);
}
export function remapHexColors(value, shifted) {
    let index = 0;
    function walk(node) {
        if (typeof node === "string" && node.startsWith("#")) {
            const next = shifted[index];
            index++;
            return next;
        }
        if (!node || typeof node !== "object") return node;
        if (Array.isArray(node)) {
            const copy = [];
            for (let i = 0; i < node.length; i++) copy.push(walk(node[i]));
            return copy;
        }
        const copy = {};
        for (const key of Object.keys(node)) copy[key] = walk(node[key]);
        return copy;
    }
    return walk(value);
}
export function shiftPaletteToHue(basePanels, targetHue) {
    let sumH = 0;
    const hsls = [];
    for (let i = 0; i < basePanels.length; i++) {
        const { r, g, b } = hexToRgb(basePanels[i]);
        const hsl = rgbToHsl(r, g, b);
        hsls.push(hsl);
        sumH += hsl.h;
    }
    const avgH = sumH / hsls.length;
    const shift = shortestHueShift(avgH, normalizeHue(targetHue));
    const out = [];
    for (let i = 0; i < hsls.length; i++) {
        const { h, s, l } = hsls[i];
        out.push(hslToHex(normalizeHue(h + shift), s, l));
    }
    return out;
}
const ACHROMATIC_SAT_THRESHOLD = 8;
export function shiftPaletteToTintHex(basePanels, tintHex) {
    const { r, g, b } = hexToRgb(tintHex);
    const tintHsl = rgbToHsl(r, g, b);
    const targetHue = normalizeHue(tintHsl.h);
    const targetSat = tintHsl.s;
    const hsls = [];
    let avgSat = 0;
    for (let i = 0; i < basePanels.length; i++) {
        const rgb = hexToRgb(basePanels[i]);
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        hsls.push(hsl);
        avgSat += hsl.s;
    }
    avgSat /= hsls.length;
    if (avgSat < ACHROMATIC_SAT_THRESHOLD) {
        const out = [];
        for (let i = 0; i < hsls.length; i++) out.push(hslToHex(targetHue, targetSat, hsls[i].l));
        return out;
    }
    return shiftPaletteToHue(basePanels, targetHue);
}
export function shiftColorTreeToTintHex(colorTree, tintHex) {
    const hexes = [];
    collectHexColors(colorTree, hexes);
    if (!hexes.length) return colorTree;
    return remapHexColors(colorTree, shiftPaletteToTintHex(hexes, tintHex));
}
