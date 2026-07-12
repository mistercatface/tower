import { SF_EVAL_X, SF_EVAL_Y, applyTint } from "../util/motifUtilities.js";
export const panelGridMotif = {
    metadata: {
        label: "Panel grid (legacy)",
        defaults: { type: "panelGrid", cellWorldSize: 16, groutWidth: 0.06, peak: 8, tint: [-4, -4, -3], variationFrequency: 0.1, variationAmplitude: 1, blendMode: "multiply" },
        fields: [
            { path: "cellWorldSize", label: "Cell world px", min: 8, max: 64, step: 1 },
            { path: "groutWidth", label: "Grout width", min: 0.01, max: 0.2, step: 0.005 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
        ],
    },
    apply(sf, si, rf, ro, config, noise) {
        const cellSize = config.cellWorldSize;
        const localX = ((sf[SF_EVAL_X] % cellSize) + cellSize) % cellSize;
        const localY = ((sf[SF_EVAL_Y] % cellSize) + cellSize) % cellSize;
        const u = localX / cellSize;
        const v = localY / cellSize;
        const edgeDist = Math.min(u, 1 - u, v, 1 - v);
        if (edgeDist >= config.groutWidth) return;
        const variation = noise.sample2D(sf[SF_EVAL_X] * config.variationFrequency, sf[SF_EVAL_Y] * config.variationFrequency, 1) * config.variationAmplitude;
        const t = (1.0 - edgeDist / config.groutWidth) * (config.peak + variation);
        applyTint(rf, ro, t, config.tint);
    },
};
