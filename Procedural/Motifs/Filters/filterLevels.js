import { clampByte } from "../../util/color.js";

export const filterLevelsMotif = {
    apply(sample, rgb, config) {
        const bp = config.blackPoint ?? 0;
        const wp = Math.max(bp + 1, config.whitePoint ?? 255);
        const gamma = config.gamma ?? 1.0;
        
        const process = (c) => {
            let norm = (c - bp) / (wp - bp);
            norm = Math.max(0, Math.min(1, norm));
            if (gamma !== 1.0) {
                norm = Math.pow(norm, 1.0 / gamma);
            }
            return clampByte(norm * 255);
        };
        
        rgb.r = process(rgb.r);
        rgb.g = process(rgb.g);
        rgb.b = process(rgb.b);
    }
};
