import { clampByte } from "../../../Color/hex.js";
import { BLEND_OPTIONS } from "../../util/blend.js";
export const filterPosterizeMotif = {
    metadata: {
        label: "Filter: Posterize",
        defaults: { type: "filterPosterize", bands: 4, blendMode: "replace" },
        fields: [
            { path: "bands", label: "Bands", min: 2, max: 64, step: 1 },
            { path: "blendMode", label: "Blend Mode", options: BLEND_OPTIONS },
        ],
    },
    apply(sample, rgb, config) {
        const bands = Math.max(2, config.bands ?? 4);
        const step = 255 / (bands - 1);
        rgb.r = clampByte(Math.round(rgb.r / step) * step);
        rgb.g = clampByte(Math.round(rgb.g / step) * step);
        rgb.b = clampByte(Math.round(rgb.b / step) * step);
    },
};
