import { clampByte } from "../../Color/colorMath.js";
import { applyTint, applyCellJitter, applyGroutBand, applyWarmSeamBand } from "../util/motifUtilities.js";
function plateMetrics(sample, config) {
    const cell = config.cellWorldSize;
    const plateW = cell * (config.plateCells ?? 2);
    const plateH = cell * (config.plateRows ?? config.plateCells ?? 2);
    const plateCol = Math.floor(sample.evalX / plateW);
    const plateRow = Math.floor(sample.evalY / plateH);
    const localX = sample.evalX - plateCol * plateW;
    const localY = sample.evalY - plateRow * plateH;
    const u = localX / plateW;
    const v = localY / plateH;
    const edgeDist = Math.min(u, 1 - u, v, 1 - v);
    return { plateCol, plateRow, localX, localY, plateW, plateH, u, v, edgeDist };
}
function applyPlateFill(rgb, plateCol, plateRow, config, noise) {
    const [jx, jy] = config.jitterOffset ?? [0, 0];
    applyCellJitter(rgb, noise, plateCol * 0.71 + jx, plateRow * 0.53 + jy, config.plateVariation ?? 3, [1, 0.95, 1.05]);
}
function applyRivets(rgb, localX, localY, plateW, plateH, config) {
    const spacing = config.rivetSpacing;
    if (!spacing || spacing <= 0) return;
    const inset = config.rivetInset ?? spacing * 0.5;
    const radius = config.rivetRadius ?? 0.02;
    const peak = config.rivetPeak ?? 5;
    const tint = config.rivetTint ?? [2, 3, 4];
    const nx = (((localX - inset) % spacing) + spacing) % spacing;
    const ny = (((localY - inset) % spacing) + spacing) % spacing;
    const nearX = nx < radius * spacing || nx > spacing - radius * spacing;
    const nearY = ny < radius * spacing || ny > spacing - radius * spacing;
    if (!nearX || !nearY) return;
    const dx = Math.min(nx, spacing - nx) / (radius * spacing);
    const dy = Math.min(ny, spacing - ny) / (radius * spacing);
    const t = (1 - Math.max(dx, dy)) * peak;
    applyTint(rgb, t, tint);
}
function tintRgb(rgb, intensity, tint) {
    rgb.r = clampByte(rgb.r + intensity * tint[0]);
    rgb.g = clampByte(rgb.g + intensity * tint[1]);
    rgb.b = clampByte(rgb.b + intensity * tint[2]);
}
function compileDeckPlates(config) {
    const cell = config.cellWorldSize;
    const plateW = cell * (config.plateCells ?? 2);
    const plateH = cell * (config.plateRows ?? config.plateCells ?? 2);
    const invPlateW = 1 / plateW;
    const invPlateH = 1 / plateH;
    const jitterOffset = config.jitterOffset ?? [0, 0];
    const jitterX = jitterOffset[0];
    const jitterY = jitterOffset[1];
    const plateVariation = config.plateVariation ?? 3;
    const plateTint = [1, 0.95, 1.05];
    const groutWidth = config.groutWidth ?? 0.05;
    const groutPeak = config.groutPeak ?? 10;
    const groutTint = config.groutTint ?? [-5, -5, -4];
    const accentWidth = config.accentWidth;
    const accentPeak = config.accentPeak ?? 5;
    const accentTint = config.accentTint ?? [4, 1, -2];
    const rivetSpacing = config.rivetSpacing;
    const rivetsEnabled = Boolean(rivetSpacing && rivetSpacing > 0);
    const rivetInset = config.rivetInset ?? rivetSpacing * 0.5;
    const rivetRadius = config.rivetRadius ?? 0.02;
    const rivetPeak = config.rivetPeak ?? 5;
    const rivetTint = config.rivetTint ?? [2, 3, 4];
    const rivetRadiusSpacing = rivetRadius * rivetSpacing;
    return (sample, rgb) => {
        const plateCol = Math.floor(sample.evalX / plateW);
        const plateRow = Math.floor(sample.evalY / plateH);
        const localX = sample.evalX - plateCol * plateW;
        const localY = sample.evalY - plateRow * plateH;
        const u = localX * invPlateW;
        const v = localY * invPlateH;
        const edgeDist = Math.min(u, 1 - u, v, 1 - v);
        const jitter = sample.noise.sample2D(plateCol * 0.71 + jitterX, plateRow * 0.53 + jitterY, 1);
        tintRgb(rgb, jitter * plateVariation, plateTint);
        if (edgeDist < groutWidth) tintRgb(rgb, (1 - edgeDist / groutWidth) * groutPeak, groutTint);
        if (accentWidth != null && accentWidth > 0 && edgeDist < accentWidth) tintRgb(rgb, (1 - edgeDist / accentWidth) * accentPeak, accentTint);
        if (!rivetsEnabled) return;
        const nx = (((localX - rivetInset) % rivetSpacing) + rivetSpacing) % rivetSpacing;
        const ny = (((localY - rivetInset) % rivetSpacing) + rivetSpacing) % rivetSpacing;
        const nearX = nx < rivetRadiusSpacing || nx > rivetSpacing - rivetRadiusSpacing;
        const nearY = ny < rivetRadiusSpacing || ny > rivetSpacing - rivetRadiusSpacing;
        if (!nearX || !nearY) return;
        const dx = Math.min(nx, rivetSpacing - nx) / rivetRadiusSpacing;
        const dy = Math.min(ny, rivetSpacing - ny) / rivetRadiusSpacing;
        tintRgb(rgb, (1 - Math.max(dx, dy)) * rivetPeak, rivetTint);
    };
}
/** World-aligned deck plates (grout, fill jitter, optional rivets). */
export const deckPlatesMotif = {
    metadata: {
        label: "Deck plates",
        defaults: {
            type: "deckPlates",
            cellWorldSize: 16,
            plateCells: 2,
            plateRows: 2,
            groutWidth: 0.045,
            groutPeak: 11,
            groutTint: [-6, -6, -5],
            plateVariation: 3,
            jitterOffset: [0, 0],
            rivetSpacing: 16,
            rivetInset: 4,
            rivetRadius: 0.018,
            rivetPeak: 5,
            rivetTint: [2, 4, 5],
            blendMode: "multiply",
        },
        fields: [
            { path: "cellWorldSize", label: "Cell world px", min: 8, max: 64, step: 1 },
            { path: "plateCells", label: "Plate cells (W)", min: 1, max: 8, step: 1 },
            { path: "plateRows", label: "Plate cells (H)", min: 1, max: 8, step: 1 },
            { path: "groutWidth", label: "Grout width", min: 0.01, max: 0.15, step: 0.005 },
            { path: "groutPeak", label: "Grout peak", min: 0, max: 20, step: 1 },
            { path: "plateVariation", label: "Plate jitter", min: 0, max: 10, step: 0.5 },
            { path: "rivetSpacing", label: "Rivet spacing (0=off)", min: 0, max: 32, step: 1 },
            { path: "rivetPeak", label: "Rivet peak", min: 0, max: 12, step: 1 },
            { path: "accentWidth", label: "Warm seam (0=off)", min: 0, max: 0.06, step: 0.002 },
            { path: "accentPeak", label: "Seam peak", min: 0, max: 12, step: 1 },
        ],
    },
    apply(sample, rgb, config) {
        const { plateCol, plateRow, localX, localY, plateW, plateH, edgeDist } = plateMetrics(sample, config);
        applyPlateFill(rgb, plateCol, plateRow, config, sample.noise);
        applyGroutBand(rgb, edgeDist, config, { groutWidth: 0.05, groutPeak: 10, groutTint: [-5, -5, -4] });
        applyWarmSeamBand(rgb, edgeDist, config);
        applyRivets(rgb, localX, localY, plateW, plateH, config);
    },
    compile: compileDeckPlates,
};
