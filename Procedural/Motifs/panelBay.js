import { clampByte } from "../util/color.js";

/**
 * Recessed module bays on wall faces (wallU/wallV). Reads as layered tech panels top-down.
 */
export const panelBayMotif = {
    metadata: {
        label: "Panel bays (wall face)",
        defaults: {
            type: "panelBay",
            rows: 5,
            cols: 2,
            inset: 0.16,
            frameWidth: 0.07,
            highlightPeak: 4,
            shadowPeak: 5,
            rimPeak: 5,
            interiorDarken: 5,
            surfaceMask: "wallFace",
            opacity: 0.9,
            blendMode: "add",
        },
        fields: [
            { path: "rows", label: "Rows", min: 2, max: 12, step: 1 },
            { path: "cols", label: "Cols", min: 1, max: 6, step: 1 },
            { path: "inset", label: "Bay inset", min: 0.05, max: 0.3, step: 0.01 },
            { path: "interiorDarken", label: "Interior dark", min: 0, max: 14, step: 1 },
            { path: "rimPeak", label: "Rim glow", min: 0, max: 12, step: 1 },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
    apply(sample, rgb, config) {
        if (!sample.isWall || sample.wallU == null || sample.wallV == null) {
            return;
        }

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
            rgb.r = clampByte(rgb.r - interior);
            rgb.g = clampByte(rgb.g - interior);
            rgb.b = clampByte(rgb.b - interior * (config.interiorCool ?? 1.05));
            return;
        }

        const rel = distToEdge / inset;
        const bevel = 1 - rel;
        const bevelSq = bevel * bevel;

        if (distToEdgeU < frame || distToEdgeV < frame) {
            const rim = (1 - Math.min(distToEdgeU, distToEdgeV) / frame) * (config.rimPeak ?? 6);
            const [tr, tg, tb] = config.rimTint ?? [0.35, 0.9, 1.3];
            rgb.r = clampByte(rgb.r + rim * tr);
            rgb.g = clampByte(rgb.g + rim * tg);
            rgb.b = clampByte(rgb.b + rim * tb);
            return;
        }

        const hi = config.highlightPeak ?? 5;
        const sh = config.shadowPeak ?? 6;
        if (localV < 0.5) {
            rgb.r = clampByte(rgb.r + bevelSq * hi);
            rgb.g = clampByte(rgb.g + bevelSq * hi);
            rgb.b = clampByte(rgb.b + bevelSq * hi * (config.coolBias ?? 1.04));
        } else {
            rgb.r = clampByte(rgb.r - bevelSq * sh);
            rgb.g = clampByte(rgb.g - bevelSq * sh);
            rgb.b = clampByte(rgb.b - bevelSq * sh * (config.coolBias ?? 1.04));
        }
    },
};
