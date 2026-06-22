import { applyTint } from "../util/motifUtilities.js";
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
function applyGrout(rgb, edgeDist, config) {
    const groutW = config.groutWidth ?? 0.05;
    if (edgeDist >= groutW) return;
    const t = (1 - edgeDist / groutW) * (config.groutPeak ?? 10);
    const tint = config.groutTint ?? [-5, -5, -4];
    applyTint(rgb, t, tint);
}
function applyWarmAccent(rgb, edgeDist, config) {
    const accentW = config.accentWidth;
    if (accentW == null || accentW <= 0) return;
    if (edgeDist >= accentW) return;
    const t = (1 - edgeDist / accentW) * (config.accentPeak ?? 5);
    const tint = config.accentTint ?? [4, 1, -2];
    applyTint(rgb, t, tint);
}
function applyPlateFill(rgb, plateCol, plateRow, config, noise) {
    const [jx, jy] = config.jitterOffset ?? [0, 0];
    const jitter = noise.sample2D(plateCol * 0.71 + jx, plateRow * 0.53 + jy, 1);
    const delta = jitter * (config.plateVariation ?? 3);
    applyTint(rgb, delta, [1, 0.95, 1.05]);
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
        applyGrout(rgb, edgeDist, config);
        applyWarmAccent(rgb, edgeDist, config);
        applyRivets(rgb, localX, localY, plateW, plateH, config);
    },
};
