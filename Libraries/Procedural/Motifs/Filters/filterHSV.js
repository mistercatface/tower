import { BLEND_MODE_REPLACE } from "../../../../Core/engineEnums.js";
import { clampByte } from "../../../Color/colorMath.js";
import { RF_R, RF_G, RF_B } from "../../util/motifUtilities.js";
function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    let h = 0,
        s = 0,
        v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max !== min) {
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }
    return [h, s, v];
}
function hsvToRgb(h, s, v) {
    let r = 0,
        g = 0,
        b = 0;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0:
            ((r = v), (g = t), (b = p));
            break;
        case 1:
            ((r = q), (g = v), (b = p));
            break;
        case 2:
            ((r = p), (g = v), (b = t));
            break;
        case 3:
            ((r = p), (g = q), (b = v));
            break;
        case 4:
            ((r = t), (g = p), (b = v));
            break;
        case 5:
            ((r = v), (g = p), (b = q));
            break;
    }
    return [r * 255, g * 255, b * 255];
}
function compileFilterHSV(config) {
    const hueShift = (config.hueShift ?? 0) / 360;
    const saturation = config.saturation ?? 1;
    const value = config.value ?? 1;
    return (sf, si, rf, ro, noise) => {
        let r = rf[ro + RF_R] / 255;
        let g = rf[ro + RF_G] / 255;
        let b = rf[ro + RF_B] / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0;
        let s = 0;
        const v = max;
        const d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max !== min) {
            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                case b:
                    h = (r - g) / d + 4;
                    break;
            }
            h /= 6;
        }
        h += hueShift;
        h -= Math.floor(h);
        s = Math.max(0, Math.min(1, s * saturation));
        const nextV = Math.max(0, Math.min(1, v * value));
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = nextV * (1 - s);
        const q = nextV * (1 - f * s);
        const t = nextV * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0:
                r = nextV;
                g = t;
                b = p;
                break;
            case 1:
                r = q;
                g = nextV;
                b = p;
                break;
            case 2:
                r = p;
                g = nextV;
                b = t;
                break;
            case 3:
                r = p;
                g = q;
                b = nextV;
                break;
            case 4:
                r = t;
                g = p;
                b = nextV;
                break;
            case 5:
                r = nextV;
                g = p;
                b = q;
                break;
        }
        rf[ro + RF_R] = clampByte(r * 255);
        rf[ro + RF_G] = clampByte(g * 255);
        rf[ro + RF_B] = clampByte(b * 255);
    };
}
import { BLEND_OPTIONS } from "../../util/blend.js";
export const filterHSVMotif = {
    metadata: {
        label: "Filter: HSV Adjust",
        defaults: { type: "filterHSV", hueShift: 0, saturation: 1, value: 1, blendMode: BLEND_MODE_REPLACE },
        fields: [
            { path: "hueShift", label: "Hue Shift", min: -180, max: 180, step: 1 },
            { path: "saturation", label: "Saturation", min: 0, max: 5, step: 0.1 },
            { path: "value", label: "Value (Brightness)", min: 0, max: 5, step: 0.1 },
            { path: "blendMode", label: "Blend Mode", options: BLEND_OPTIONS },
        ]},
    apply(sf, si, rf, ro, config, noise) {
        const [h, s, v] = rgbToHsv(rf[ro + RF_R], rf[ro + RF_G], rf[ro + RF_B]);
        let newH = h + (config.hueShift ?? 0) / 360;
        newH = newH - Math.floor(newH); // wrap around 0-1
        const newS = Math.max(0, Math.min(1, s * (config.saturation ?? 1)));
        const newV = Math.max(0, Math.min(1, v * (config.value ?? 1)));
        const [nr, ng, nb] = hsvToRgb(newH, newS, newV);
        rf[ro + RF_R] = clampByte(nr);
        rf[ro + RF_G] = clampByte(ng);
        rf[ro + RF_B] = clampByte(nb);
    },
    compile: compileFilterHSV};
