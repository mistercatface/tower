import { clampByte } from "../../util/color.js";

export const filterRGBAdjustMotif = {
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
    }
};
