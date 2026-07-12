import { SURFACE_MASK_WALL_FACE } from "../../../Core/engineEnums.js";
import { applyTint } from "../util/motifUtilities.js";
/**
 * Recessed module bays on wall faces (wallU/wallV). Reads as layered tech panels top-down.
 */
export const panelBayMotif = {
    metadata: {
        label: "Panel bays (wall face)",
        defaults: { type: "panelBay", rows: 5, cols: 2, inset: 0.16, frameWidth: 0.07, highlightPeak: 4, shadowPeak: 5, rimPeak: 5, interiorDarken: 5, surfaceMask: SURFACE_MASK_WALL_FACE, blendMode: "add" },
        fields: [
            { path: "rows", label: "Rows", min: 2, max: 12, step: 1 },
            { path: "cols", label: "Cols", min: 1, max: 6, step: 1 },
            { path: "inset", label: "Bay inset", min: 0.05, max: 0.3, step: 0.01 },
            { path: "interiorDarken", label: "Interior dark", min: 0, max: 14, step: 1 },
            { path: "rimPeak", label: "Rim glow", min: 0, max: 12, step: 1 },
        ],
    },
    apply(sample, rgb, config) {
        if (!sample.isWall || sample.wallU == null || sample.wallV == null) return;
        const rows = config.rows ?? 5;
        const cols = config.cols ?? 2;
        const inset = config.inset ?? 0.14;
        const frame = config.frameWidth ?? 0.08;
        const rowH = 1 / rows;
        const colW = 1 / cols;
        const localV = (sample.wallV % rowH) / rowH;
        const localU = (sample.wallU % colW) / colW;
        const distToEdgeU = Math.min(localU, 1 - localU);
        const distToEdgeV = Math.min(localV, 1 - localV);
        const distToEdge = Math.min(distToEdgeU, distToEdgeV);
        if (distToEdge >= inset) {
            const interior = config.interiorDarken ?? 7;
            applyTint(rgb, -interior, [1, 1, config.interiorCool ?? 1.05]);
            return;
        }
        const rel = distToEdge / inset;
        const bevel = 1 - rel;
        const bevelSq = bevel * bevel;
        if (distToEdgeU < frame || distToEdgeV < frame) {
            const rim = (1 - Math.min(distToEdgeU, distToEdgeV) / frame) * (config.rimPeak ?? 6);
            const [tr, tg, tb] = config.rimTint ?? [0.35, 0.9, 1.3];
            applyTint(rgb, rim, [tr, tg, tb]);
            return;
        }
        const hi = config.highlightPeak ?? 5;
        const sh = config.shadowPeak ?? 6;
        if (localV < 0.5) applyTint(rgb, bevelSq * hi, [1, 1, config.coolBias ?? 1.04]);
        else applyTint(rgb, -bevelSq * sh, [1, 1, config.coolBias ?? 1.04]);
    },
};
