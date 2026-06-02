import { clampByte } from "../util/color.js";
import { noise2D } from "../Noise/Perlin2D.js";

export const panelGridMotif = {
    metadata: {
        label: "Panel grid (legacy)",
        defaults: {
            type: "panelGrid",
            cellWorldSize: 16,
            groutWidth: 0.06,
            peak: 8,
            tint: [-4, -4, -3],
            variationFrequency: 0.1,
            variationAmplitude: 1,
            opacity: 0.7,
            blendMode: "multiply",
        },
        fields: [
            { path: "cellWorldSize", label: "Cell world px", min: 8, max: 64, step: 1 },
            { path: "groutWidth", label: "Grout width", min: 0.01, max: 0.2, step: 0.005 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
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
