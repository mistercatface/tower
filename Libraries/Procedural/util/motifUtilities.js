import { clampByte } from "../../Color/colorMath.js";
export function sampleCoords(sample, coordinateSpace) {
    if (coordinateSpace === "warped") return { x: sample.lookupX, y: sample.lookupY };
    return { x: sample.evalX, y: sample.evalY };
}
export function applyTint(rgb, intensity, tint) {
    rgb.r = clampByte(rgb.r + intensity * tint[0]);
    rgb.g = clampByte(rgb.g + intensity * tint[1]);
    rgb.b = clampByte(rgb.b + intensity * tint[2]);
}
export function sampleRidged2D(noise, x, y, octaves) {
    return Math.abs(noise.sample2D(x, y, octaves));
}
export function applyEdgeBandTint(rgb, edgeDist, width, peak, tint) {
    if (edgeDist >= width) return;
    applyTint(rgb, (1 - edgeDist / width) * peak, tint);
}
export function applyGroutBand(rgb, edgeDist, config, defaults = {}) {
    applyEdgeBandTint(rgb, edgeDist, config.groutWidth ?? defaults.groutWidth ?? 0.08, config.groutPeak ?? defaults.groutPeak ?? 12, config.groutTint ?? defaults.groutTint ?? [4, 2, -2]);
}
export function applyWarmSeamBand(rgb, edgeDist, config, defaults = {}) {
    const accentW = config.accentWidth;
    if (accentW == null || accentW <= 0) return;
    applyEdgeBandTint(rgb, edgeDist, accentW, config.accentPeak ?? defaults.accentPeak ?? 5, config.accentTint ?? defaults.accentTint ?? [4, 1, -2]);
}
export function applyCellJitter(rgb, noise, x, y, amplitude, tintScale) {
    const jitter = noise.sample2D(x, y, 1);
    applyTint(rgb, jitter * amplitude, tintScale);
}
export function hash2(x, y) {
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
    return h - Math.floor(h);
}
