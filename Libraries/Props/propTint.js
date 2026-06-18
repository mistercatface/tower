function clampByte(value) {
    return Math.max(0, Math.min(255, value));
}

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHsl(r, g, b) {
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

function hslToHex(h, s, l) {
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
    const toByte = (v) => clampByte(Math.round((v + m) * 255));
    const rr = toByte(r).toString(16).padStart(2, "0");
    const gg = toByte(g).toString(16).padStart(2, "0");
    const bb = toByte(b).toString(16).padStart(2, "0");
    return `#${rr}${gg}${bb}`;
}

function normalizeHue(h) {
    let hue = h % 360;
    if (hue < 0) hue += 360;
    return hue;
}

function shortestHueShift(fromHue, toHue) {
    let shift = toHue - fromHue;
    while (shift > 180) shift -= 360;
    while (shift < -180) shift += 360;
    return shift;
}

function collectHexColors(value, out) {
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

function remapHexColors(value, shifted) {
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

export function hexToPropTintHue(hex) {
    const { r, g, b } = hexToRgb(hex);
    return normalizeHue(rgbToHsl(r, g, b).h);
}

export function propTintHueToHex(hue, saturation = 70, lightness = 50) {
    return hslToHex(normalizeHue(hue), saturation, lightness);
}

export function shiftPanelPaletteToHue(basePanels, targetHue) {
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

export function resolvePropTintedColorTree(prop, colorTree) {
    if (prop.propTint == null || colorTree == null) return colorTree;
    const hexes = [];
    collectHexColors(colorTree, hexes);
    if (!hexes.length) return colorTree;
    return remapHexColors(colorTree, shiftPanelPaletteToHue(hexes, prop.propTint));
}

export function resolveTintedSpherePanels(prop, assetPanels) {
    if (prop.propTint == null) return assetPanels;
    return shiftPanelPaletteToHue(assetPanels, prop.propTint);
}

export function randomPropTintHue(rng = Math.random) {
    return normalizeHue(rng() * 360);
}

export function setPropTint(prop, hue) {
    prop.propTint = normalizeHue(hue);
}

export function clearPropTint(prop) {
    delete prop.propTint;
}

export function getPropTintHue(prop) {
    return prop.propTint ?? null;
}

export function propTintCacheKey(prop) {
    if (prop.propTint == null) return "";
    return `t${Math.round(prop.propTint)}`;
}

export function assetHasTintableColors(asset) {
    if (asset?.visuals?.panels?.length) return true;
    const hexes = [];
    collectHexColors(asset?.visuals?.colors, hexes);
    return hexes.length > 0;
}

export function sampleAssetTintHex(asset) {
    const panels = asset?.visuals?.panels;
    if (panels?.[0]) return panels[0];
    const hexes = [];
    collectHexColors(asset?.visuals?.colors, hexes);
    return hexes[0] ?? "#888888";
}

export function resolvePropTintPickerHex(prop, asset) {
    if (prop.propTint != null) return propTintHueToHex(prop.propTint);
    return sampleAssetTintHex(asset);
}

export function setPropTintFromPickerHex(prop, hex) {
    setPropTint(prop, hexToPropTintHue(hex));
}

export function isPropTintable(asset) {
    return assetHasTintableColors(asset);
}

export function resolveSpawnPaletteSwatchHex(asset, spawnTintHue) {
    if (spawnTintHue != null && assetHasTintableColors(asset)) return propTintHueToHex(spawnTintHue);
    return sampleAssetTintHex(asset);
}
