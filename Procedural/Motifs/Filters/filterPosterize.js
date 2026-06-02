import { clampByte } from "../../util/color.js";

export const filterPosterizeMotif = {
    apply(sample, rgb, config) {
        const bands = Math.max(2, config.bands ?? 4);
        const step = 255 / (bands - 1);
        
        rgb.r = clampByte(Math.round(rgb.r / step) * step);
        rgb.g = clampByte(Math.round(rgb.g / step) * step);
        rgb.b = clampByte(Math.round(rgb.b / step) * step);
    }
};
