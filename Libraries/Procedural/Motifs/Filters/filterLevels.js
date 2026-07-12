import { clampByte } from "../../../Color/colorMath.js";
import { BLEND_OPTIONS } from "../../util/blend.js";
import { RF_R, RF_G, RF_B } from "../../util/motifUtilities.js";
export const filterLevelsMotif = {
    metadata: {
        label: "Filter: Levels",
        defaults: { type: "filterLevels", blackPoint: 0, whitePoint: 255, gamma: 1.0, blendMode: "replace" },
        fields: [
            { path: "blackPoint", label: "Black Point", min: 0, max: 254, step: 1 },
            { path: "whitePoint", label: "White Point", min: 1, max: 255, step: 1 },
            { path: "gamma", label: "Gamma", min: 0.1, max: 5.0, step: 0.1 },
            { path: "blendMode", label: "Blend Mode", options: BLEND_OPTIONS },
        ],
    },
    apply(sf, si, rf, ro, config, noise) {
        const bp = config.blackPoint ?? 0;
        const wp = Math.max(bp + 1, config.whitePoint ?? 255);
        const gamma = config.gamma ?? 1.0;
        const process = (c) => {
            let norm = (c - bp) / (wp - bp);
            norm = Math.max(0, Math.min(1, norm));
            if (gamma !== 1.0) norm = Math.pow(norm, 1.0 / gamma);
            return clampByte(norm * 255);
        };
        rf[ro + RF_R] = process(rf[ro + RF_R]);
        rf[ro + RF_G] = process(rf[ro + RF_G]);
        rf[ro + RF_B] = process(rf[ro + RF_B]);
    },
};
