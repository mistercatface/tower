import { clampByte } from "../../Color/colorMath.js";
import { COORD_SPACE_WARPED } from "../../../Core/engineEnums.js";
export const SF_EVAL_X = 0;
export const SF_EVAL_Y = 1;
export const SF_LOOKUP_X = 2;
export const SF_LOOKUP_Y = 3;
export const SF_WALL_U = 4;
export const SF_WALL_V = 5;
export const SF_SEED = 6;
export const SF_COUNT = 7;
export const SI_IS_WALL = 0;
export const SI_COUNT = 1;
export const RF_R = 0;
export const RF_G = 1;
export const RF_B = 2;
export function sampleCoordX(sf, coordinateSpace) {
    return coordinateSpace === COORD_SPACE_WARPED ? sf[SF_LOOKUP_X] : sf[SF_EVAL_X];
}
export function sampleCoordY(sf, coordinateSpace) {
    return coordinateSpace === COORD_SPACE_WARPED ? sf[SF_LOOKUP_Y] : sf[SF_EVAL_Y];
}
export function applyTint(rf, ro, intensity, tint) {
    rf[ro + RF_R] = clampByte(rf[ro + RF_R] + intensity * tint[0]);
    rf[ro + RF_G] = clampByte(rf[ro + RF_G] + intensity * tint[1]);
    rf[ro + RF_B] = clampByte(rf[ro + RF_B] + intensity * tint[2]);
}
export function sampleRidged2D(noise, x, y, octaves) {
    return Math.abs(noise.sample2D(x, y, octaves));
}
export function applyEdgeBandTint(rf, ro, edgeDist, width, peak, tint) {
    if (edgeDist >= width) return;
    applyTint(rf, ro, (1 - edgeDist / width) * peak, tint);
}
export function applyGroutBand(rf, ro, edgeDist, config, defaults = {}) {
    applyEdgeBandTint(rf, ro, edgeDist, config.groutWidth ?? defaults.groutWidth ?? 0.08, config.groutPeak ?? defaults.groutPeak ?? 12, config.groutTint ?? defaults.groutTint ?? [4, 2, -2]);
}
export function applyWarmSeamBand(rf, ro, edgeDist, config, defaults = {}) {
    const accentW = config.accentWidth;
    if (accentW == null || accentW <= 0) return;
    applyEdgeBandTint(rf, ro, edgeDist, accentW, config.accentPeak ?? defaults.accentPeak ?? 5, config.accentTint ?? defaults.accentTint ?? [4, 1, -2]);
}
export function applyCellJitter(rf, ro, noise, x, y, amplitude, tintScale) {
    const jitter = noise.sample2D(x, y, 1);
    applyTint(rf, ro, jitter * amplitude, tintScale);
}
export function hash2(x, y) {
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
    return h - Math.floor(h);
}
