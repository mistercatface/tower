import { applyTint } from "../util/motifUtilities.js";
/** Darkens walls toward the top; wallV = 0 at the floor seam, 1 at the top. */
export const wallLightingMotif = {
    metadata: {
        label: "Wall lighting",
        defaults: { type: "wallLighting", power: 1, topDarken: 4, coolBias: 1.04, opacity: 1, blendMode: "multiply" },
        fields: [
            { path: "power", label: "Power", min: 0.2, max: 2, step: 0.05 },
            { path: "topDarken", label: "Top darken", min: 0, max: 20, step: 1 },
            { path: "coolBias", label: "Cool bias", min: 0.8, max: 1.3, step: 0.02 },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
    apply(sample, rgb, config) {
        if (!sample.isWall || sample.wallV == null) return;
        const t = Math.pow(sample.wallV, config.power ?? 1.2);
        const darken = t * (config.topDarken ?? 14);
        applyTint(rgb, -darken, [1, 1, config.coolBias ?? 1.05]);
    },
};
