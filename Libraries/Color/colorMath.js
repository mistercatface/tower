// Color Math & Manipulation Utilities
export function clampByte(value) {
    return Math.max(0, Math.min(255, value));
}
export function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
export function rgbToHex(r, g, b) {
    const rr = clampByte(Math.round(r)).toString(16).padStart(2, "0");
    const gg = clampByte(Math.round(g)).toString(16).padStart(2, "0");
    const bb = clampByte(Math.round(b)).toString(16).padStart(2, "0");
    return `#${rr}${gg}${bb}`;
}
export function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: l * 100 };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return { h: h * 360, s: s * 100, l: l * 100 };
}
export function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) {
        r = c;
        g = x;
    } else if (h < 120) {
        r = x;
        g = c;
    } else if (h < 180) {
        g = c;
        b = x;
    } else if (h < 240) {
        g = x;
        b = c;
    } else if (h < 300) {
        r = x;
        b = c;
    } else {
        r = c;
        b = x;
    }
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
export function hexToHue(hex) {
    const { r, g, b } = hexToRgb(hex);
    return normalizeHue(rgbToHsl(r, g, b).h);
}
export function normalizeHue(h) {
    let hue = h % 360;
    if (hue < 0) hue += 360;
    return hue;
}
export function shadeHex(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    const scale = 1 - amount;
    return rgbToHex(r * scale, g * scale, b * scale);
}
export function normalizePickerHex(hex) {
    if (typeof hex !== "string") return null;
    const trimmed = hex.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
        const r = trimmed[1];
        const g = trimmed[2];
        const b = trimmed[3];
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return null;
}
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
