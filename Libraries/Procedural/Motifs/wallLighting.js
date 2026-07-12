import { BLEND_MODE_MULTIPLY } from "../../../Core/engineEnums.js";
import { SF_WALL_V, SI_IS_WALL, applyTint } from "../util/motifUtilities.js";
/** Darkens walls toward the top; wallV = 0 at the floor seam, 1 at the top. */
export const wallLightingMotif = {
    metadata: {
        label: "Wall lighting",
        defaults: { type: "wallLighting", power: 1, topDarken: 4, coolBias: 1.04, blendMode: BLEND_MODE_MULTIPLY },
        fields: [
            { path: "power", label: "Power", min: 0.2, max: 2, step: 0.05 },
            { path: "topDarken", label: "Top darken", min: 0, max: 20, step: 1 },
            { path: "coolBias", label: "Cool bias", min: 0.8, max: 1.3, step: 0.02 },
        ]},
    apply(sf, si, rf, ro, config, noise) {
        if (!si[SI_IS_WALL]) return;
        const t = Math.pow(sf[SF_WALL_V], config.power ?? 1.2);
        const darken = t * (config.topDarken ?? 14);
        applyTint(rf, ro, -darken, [1, 1, config.coolBias ?? 1.05]);
    }};
