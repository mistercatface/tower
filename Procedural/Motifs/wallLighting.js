import { clampByte } from "../util/color.js";

/** Darkens walls toward the top; wallV = 0 at the floor seam, 1 at the top. */
export const wallLightingMotif = {
    apply(sample, rgb, config) {
        if (!sample.isWall || sample.wallV == null) {
            return;
        }
        const t = Math.pow(sample.wallV, config.power ?? 1.2);
        const darken = t * (config.topDarken ?? 14);
        rgb.r = clampByte(rgb.r - darken);
        rgb.g = clampByte(rgb.g - darken);
        rgb.b = clampByte(rgb.b - darken * (config.coolBias ?? 1.05));
    },
};
