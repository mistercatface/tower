import { clampByte } from "../../../Color/colorMath.js";
import { BLEND_OPTIONS } from "../../util/blend.js";
import { RF_R, RF_G, RF_B } from "../../util/motifUtilities.js";
export const filterPosterizeMotif = {
    metadata: {
        label: "Filter: Posterize",
        defaults: { type: "filterPosterize", bands: 4, blendMode: "replace" },
        fields: [
            { path: "bands", label: "Bands", min: 2, max: 64, step: 1 },
            { path: "blendMode", label: "Blend Mode", options: BLEND_OPTIONS },
        ],
    },
    apply(sf, si, rf, ro, config, noise) {
        const bands = Math.max(2, config.bands ?? 4);
        const step = 255 / (bands - 1);
        rf[ro + RF_R] = clampByte(Math.round(rf[ro + RF_R] / step) * step);
        rf[ro + RF_G] = clampByte(Math.round(rf[ro + RF_G] / step) * step);
        rf[ro + RF_B] = clampByte(Math.round(rf[ro + RF_B] / step) * step);
    },
};
