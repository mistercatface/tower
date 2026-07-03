import { clampByte } from "../../../Color/colorMath.js";
import { BLEND_OPTIONS } from "../../util/blend.js";
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
    apply(sample, rgb, config) {
        const bp = config.blackPoint ?? 0;
        const wp = Math.max(bp + 1, config.whitePoint ?? 255);
        const gamma = config.gamma ?? 1.0;
        const process = (c) => {
            let norm = (c - bp) / (wp - bp);
            norm = Math.max(0, Math.min(1, norm));
            if (gamma !== 1.0) norm = Math.pow(norm, 1.0 / gamma);
            return clampByte(norm * 255);
        };
        rgb.r = process(rgb.r);
        rgb.g = process(rgb.g);
        rgb.b = process(rgb.b);
    },
};
