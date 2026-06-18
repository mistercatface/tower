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
export function hueToPickerHex(hue, saturation = 70, lightness = 50) {
    return hslToHex(normalizeHue(hue), saturation, lightness);
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
