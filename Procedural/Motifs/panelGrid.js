import { clampByte } from "../util/color.js";
import { noise2D } from "../Noise/Perlin2D.js";

export const panelGridMotif = {
    apply(sample, rgb, config) {
        const cellSize = config.cellWorldSize;
        const localX = ((sample.evalX % cellSize) + cellSize) % cellSize;
        const localY = ((sample.evalY % cellSize) + cellSize) % cellSize;
        const u = localX / cellSize;
        const v = localY / cellSize;
        const edgeDist = Math.min(u, 1 - u, v, 1 - v);

        if (edgeDist >= config.groutWidth) {
            return;
        }

        const variation =
            noise2D(sample.evalX * config.variationFrequency, sample.evalY * config.variationFrequency, 1) *
            config.variationAmplitude;
        const t = (1.0 - edgeDist / config.groutWidth) * (config.peak + variation);
        rgb.r = clampByte(rgb.r + t * config.tint[0]);
        rgb.g = clampByte(rgb.g + t * config.tint[1]);
        rgb.b = clampByte(rgb.b + t * config.tint[2]);
    },
};
