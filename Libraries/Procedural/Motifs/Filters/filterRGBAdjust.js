import { clampByte } from "../../util/color.js";
import { BLEND_OPTIONS } from "../../util/blend.js";
export const filterRGBAdjustMotif = {
    metadata: {
        label: "Filter: RGB Adjust",
        defaults: { type: "filterRGBAdjust", rMult: 1, gMult: 1, bMult: 1, rOffset: 0, gOffset: 0, bOffset: 0, blendMode: "replace", opacity: 1 },
        fields: [
            { path: "rMult", label: "R Multiplier", min: 0, max: 5, step: 0.1 },
            { path: "gMult", label: "G Multiplier", min: 0, max: 5, step: 0.1 },
            { path: "bMult", label: "B Multiplier", min: 0, max: 5, step: 0.1 },
            { path: "rOffset", label: "R Offset", min: -255, max: 255, step: 1 },
            { path: "gOffset", label: "G Offset", min: -255, max: 255, step: 1 },
            { path: "bOffset", label: "B Offset", min: -255, max: 255, step: 1 },
            { path: "blendMode", label: "Blend Mode", options: BLEND_OPTIONS },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
    apply(sample, rgb, config) {
        const rMult = config.rMult ?? 1;
        const gMult = config.gMult ?? 1;
        const bMult = config.bMult ?? 1;
        const rOffset = config.rOffset ?? 0;
        const gOffset = config.gOffset ?? 0;
        const bOffset = config.bOffset ?? 0;
        rgb.r = clampByte(rgb.r * rMult + rOffset);
        rgb.g = clampByte(rgb.g * gMult + gOffset);
        rgb.b = clampByte(rgb.b * bMult + bOffset);
    },
};
