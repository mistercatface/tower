import { BLEND_MODE_MULTIPLY } from "../../../Core/engineEnums.js";
import { SF_EVAL_X, SF_EVAL_Y, applyTint, applyCellJitter, applyGroutBand, applyWarmSeamBand } from "../util/motifUtilities.js";
const SQRT3 = Math.sqrt(3);
/** Flat-top hex: circumradius `size` (center to vertex). */
function axialRound(q, r) {
    let x = q;
    let z = r;
    let y = -x - z;
    let rx = Math.round(x);
    let ry = Math.round(y);
    let rz = Math.round(z);
    const xDiff = Math.abs(rx - x);
    const yDiff = Math.abs(ry - y);
    const zDiff = Math.abs(rz - z);
    if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
    else if (yDiff > zDiff) ry = -rx - rz;
    else rz = -rx - ry;
    return { q: rx, r: rz };
}
function pixelToAxial(wx, wy, size) {
    const q = ((2 / 3) * wx) / size;
    const r = ((-1 / 3) * wx + (SQRT3 / 3) * wy) / size;
    return axialRound(q, r);
}
function axialToPixel(q, r, size) {
    return { x: size * 1.5 * q, y: size * SQRT3 * (r + q * 0.5) };
}
function hexSignedDistance(lx, ly, size) {
    const ax = Math.abs(lx);
    const ay = Math.abs(ly);
    const d = size * SQRT3 * 0.5;
    return Math.max(ay - d, (ax * SQRT3 + ay) * 0.5 - d);
}
function hexMetrics(sf, config) {
    const cellWorld = config.cellWorldSize ?? 16;
    const size = cellWorld / SQRT3;
    const apothem = size * SQRT3 * 0.5;
    const { q, r } = pixelToAxial(sf[SF_EVAL_X], sf[SF_EVAL_Y], size);
    const center = axialToPixel(q, r, size);
    const lx = sf[SF_EVAL_X] - center.x;
    const ly = sf[SF_EVAL_Y] - center.y;
    const sdf = hexSignedDistance(lx, ly, size);
    const distInside = Math.max(0, -sdf);
    const edgeDist = distInside / Math.max(1, apothem);
    return { q, r, edgeDist, distInside, size, lx, ly };
}
function applyBevel(rf, ro, lx, ly, edgeDist, config) {
    const groutW = config.groutWidth ?? 0.08;
    const bevelW = config.bevelWidth;
    if (bevelW == null || bevelW <= 0) return;
    const distInBevel = edgeDist - groutW;
    if (distInBevel < 0 || distInBevel >= bevelW) return;
    let t = 1 - distInBevel / bevelW;
    const curve = config.bevelCurve ?? "linear";
    const falloff = config.bevelFalloff ?? 1.0;
    if (curve === "smooth") t = t * t * (3 - 2 * t);
    else if (curve === "steep") t = Math.pow(t, falloff);
    else if (falloff !== 1.0)
        // linear with optional falloff
        t = Math.pow(t, falloff);
    // Light from top-left (lx + ly < 0)
    const isTopLeft = lx + ly < 0;
    const peak = isTopLeft ? (config.highlightPeak ?? 8) : (config.shadowPeak ?? -6);
    const tint = config.bevelTint ?? [1, 1, 1];
    applyTint(rf, ro, t * peak, tint);
}
function applyCellFill(rf, ro, q, r, config, noise) {
    const [jx, jy] = config.jitterOffset ?? [0, 0];
    applyCellJitter(rf, ro, noise, q * 0.63 + jx, r * 0.47 + jy, config.cellVariation ?? 2, [1, 0.98, 1.02]);
}
/** World-aligned flat-top hex grid — grout lines continue across floor and wall bases. */
export const hexGridMotif = {
    metadata: {
        label: "Hex grid",
        defaults: { type: "hexGrid", cellWorldSize: 16, groutWidth: 0.08, groutPeak: 12, groutTint: [5, 2, -3], cellVariation: 2, jitterOffset: [0, 0], bevelWidth: 0.0, highlightPeak: 8, shadowPeak: -6, bevelTint: [1, 1, 1], blendMode: BLEND_MODE_MULTIPLY },
        fields: [
            { path: "cellWorldSize", label: "Cell world px", min: 8, max: 64, step: 1 },
            { path: "groutWidth", label: "Grout width", min: 0.02, max: 0.2, step: 0.005 },
            { path: "groutPeak", label: "Grout peak", min: -20, max: 20, step: 1 },
            { path: "groutTint.0", label: "Grout R Δ", min: -12, max: 12, step: 1 },
            { path: "groutTint.1", label: "Grout G Δ", min: -12, max: 12, step: 1 },
            { path: "groutTint.2", label: "Grout B Δ", min: -12, max: 12, step: 1 },
            { path: "bevelWidth", label: "Bevel width", min: 0.0, max: 0.15, step: 0.005 },
            { path: "highlightPeak", label: "Highlight peak", min: 0, max: 20, step: 1 },
            { path: "shadowPeak", label: "Shadow peak", min: -20, max: 0, step: 1 },
            { path: "cellVariation", label: "Cell jitter", min: 0, max: 8, step: 0.5 },
            { path: "bevelCurve", label: "Bevel Curve", options: ["linear", "smooth", "steep"] },
            { path: "bevelFalloff", label: "Falloff", min: 0.1, max: 4.0, step: 0.1 },
        ]},
    apply(sf, si, rf, ro, config, noise) {
        const { q, r, edgeDist, lx, ly } = hexMetrics(sf, config);
        applyCellFill(rf, ro, q, r, config, noise);
        applyBevel(rf, ro, lx, ly, edgeDist, config);
        applyGroutBand(rf, ro, edgeDist, config, { groutWidth: 0.08, groutPeak: 12, groutTint: [4, 2, -2] });
        applyWarmSeamBand(rf, ro, edgeDist, config);
    }};
