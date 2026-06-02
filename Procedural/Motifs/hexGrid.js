import { clampByte } from "../util/color.js";
import { noise2D } from "../Noise/Perlin2D.js";

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
    if (xDiff > yDiff && xDiff > zDiff) {
        rx = -ry - rz;
    } else if (yDiff > zDiff) {
        ry = -rx - rz;
    } else {
        rz = -rx - ry;
    }
    return { q: rx, r: rz };
}

function pixelToAxial(wx, wy, size) {
    const q = ((2 / 3) * wx) / size;
    const r = ((-1 / 3) * wx + (SQRT3 / 3) * wy) / size;
    return axialRound(q, r);
}

function axialToPixel(q, r, size) {
    return {
        x: size * 1.5 * q,
        y: size * SQRT3 * (r + q * 0.5),
    };
}

function hexSignedDistance(lx, ly, size) {
    const ax = Math.abs(lx);
    const ay = Math.abs(ly);
    const d = size * SQRT3 * 0.5;
    return Math.max(ay - d, (ax * SQRT3 + ay) * 0.5 - d);
}

function hexMetrics(sample, config) {
    const cellWorld = config.cellWorldSize ?? 16;
    const size = cellWorld / SQRT3;
    const { q, r } = pixelToAxial(sample.evalX, sample.evalY, size);
    const center = axialToPixel(q, r, size);
    const lx = sample.evalX - center.x;
    const ly = sample.evalY - center.y;
    const sdf = hexSignedDistance(lx, ly, size);
    const distInside = Math.max(0, -sdf);
    const edgeDist = distInside / Math.max(1, size * 0.5);
    return { q, r, edgeDist, distInside, size, lx, ly };
}

function applyBevel(rgb, lx, ly, edgeDist, config) {
    const groutW = config.groutWidth ?? 0.08;
    const bevelW = config.bevelWidth;
    if (bevelW == null || bevelW <= 0) {
        return;
    }
    const distInBevel = edgeDist - groutW;
    if (distInBevel < 0 || distInBevel >= bevelW) {
        return;
    }
    let t = (1 - distInBevel / bevelW);
    
    const curve = config.bevelCurve ?? "linear";
    const falloff = config.bevelFalloff ?? 1.0;
    
    if (curve === "smooth") {
        t = t * t * (3 - 2 * t);
    } else if (curve === "steep") {
        t = Math.pow(t, falloff);
    } else {
        // linear with optional falloff
        if (falloff !== 1.0) {
            t = Math.pow(t, falloff);
        }
    }
    
    // Light from top-left (lx + ly < 0)
    const isTopLeft = (lx + ly) < 0;
    const peak = isTopLeft ? (config.highlightPeak ?? 8) : (config.shadowPeak ?? -6);
    const tint = config.bevelTint ?? [1, 1, 1];
    rgb.r = clampByte(rgb.r + t * peak * tint[0]);
    rgb.g = clampByte(rgb.g + t * peak * tint[1]);
    rgb.b = clampByte(rgb.b + t * peak * tint[2]);
}

function applyGrout(rgb, edgeDist, config) {
    const groutW = config.groutWidth ?? 0.08;
    if (edgeDist >= groutW) {
        return;
    }
    const t = (1 - edgeDist / groutW) * (config.groutPeak ?? 12);
    const tint = config.groutTint ?? [4, 2, -2];
    rgb.r = clampByte(rgb.r + t * tint[0]);
    rgb.g = clampByte(rgb.g + t * tint[1]);
    rgb.b = clampByte(rgb.b + t * tint[2]);
}

function applyWarmAccent(rgb, edgeDist, config) {
    const accentW = config.accentWidth;
    if (accentW == null || accentW <= 0) {
        return;
    }
    if (edgeDist >= accentW) {
        return;
    }
    const t = (1 - edgeDist / accentW) * (config.accentPeak ?? 5);
    const tint = config.accentTint ?? [4, 1, -2];
    rgb.r = clampByte(rgb.r + t * tint[0]);
    rgb.g = clampByte(rgb.g + t * tint[1]);
    rgb.b = clampByte(rgb.b + t * tint[2]);
}

function applyCellFill(rgb, q, r, config) {
    const [jx, jy] = config.jitterOffset ?? [0, 0];
    const jitter = noise2D(q * 0.63 + jx, r * 0.47 + jy, 1);
    const delta = jitter * (config.cellVariation ?? 2);
    rgb.r = clampByte(rgb.r + delta);
    rgb.g = clampByte(rgb.g + delta * 0.98);
    rgb.b = clampByte(rgb.b + delta * 1.02);
}

/** World-aligned flat-top hex grid — grout lines continue across floor and wall bases. */
export const hexGridMotif = {
    metadata: {
        label: "Hex grid",
        defaults: {
            type: "hexGrid",
            cellWorldSize: 16,
            groutWidth: 0.08,
            groutPeak: 12,
            groutTint: [5, 2, -3],
            cellVariation: 2,
            jitterOffset: [0, 0],
            bevelWidth: 0.0,
            highlightPeak: 8,
            shadowPeak: -6,
            bevelTint: [1, 1, 1],
            blendMode: "multiply",
            opacity: 0.9,
        },
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
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
    apply(sample, rgb, config) {
        const { q, r, edgeDist, lx, ly } = hexMetrics(sample, config);
        applyCellFill(rgb, q, r, config);
        applyBevel(rgb, lx, ly, edgeDist, config);
        applyGrout(rgb, edgeDist, config);
        applyWarmAccent(rgb, edgeDist, config);
    },
};
