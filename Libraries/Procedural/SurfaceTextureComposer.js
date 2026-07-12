import { clampByte } from "../Color/colorMath.js";
import { blendMotifRgb } from "./util/blend.js";
import { SF_EVAL_X, SF_EVAL_Y, SF_LOOKUP_X, SF_LOOKUP_Y, SF_WALL_U, SF_WALL_V, SF_SEED, SF_COUNT, SI_IS_WALL, SI_COUNT, RF_R, RF_G, RF_B } from "./util/motifUtilities.js";
import { writeDomainWarp, warpPointInto } from "./Fields/DomainWarp.js";
import { getMotif } from "./MotifRegistry.js";
import { readTranslateInto } from "./Motifs/translate.js";
import { BI_WIDTH, BI_HEIGHT, BI_USE_WALL_BASE, BI_WALL_FACE, BI_WALL_CELL } from "../WorldSurface/worldSurface.js";
import { SURFACE_MASK_ALL, SURFACE_MASK_FLOOR, SURFACE_MASK_WALL, SURFACE_MASK_WALL_FACE, SURFACE_MASK_WALL_CELL, BLEND_MODE_ADD, BLEND_MODE_REPLACE, COORD_SPACE_EVAL, COORD_SPACE_WARPED, TRANSLATE_MODE_EVAL_AND_WARPED, TRANSLATE_MODE_EVAL_ONLY } from "../../Core/engineEnums.js";
export { SF_EVAL_X, SF_EVAL_Y, SF_LOOKUP_X, SF_LOOKUP_Y, SF_WALL_U, SF_WALL_V, SF_SEED, SF_COUNT, SI_IS_WALL, SI_COUNT, RF_R, RF_G, RF_B };
const SAMPLE_F32 = new Float32Array(SF_COUNT);
const SAMPLE_I32 = new Int32Array(SI_COUNT);
const RGB_F32 = new Float32Array(9);
const RF_BEFORE = 0;
const RF_LAYER = 3;
const RF_BLEND = 6;
const WARP_OUT = new Float32Array(2);
const LAYER_XY = new Float32Array(2);
const TX_X = 0;
const TX_Y = 1;
const TX_MODE = 0;
const TX_ACTIVE = 1;
const translateF32 = new Float32Array(2);
const translateI32 = new Int32Array(2);
const passImpl = [];
const passConfig = [];
const passRunner = [];
const passBlendMode = [];
function resolvePaletteBase(profile, useWallBase) {
    if (useWallBase && profile.palette.wallBase) return profile.palette.wallBase;
    if (!useWallBase && profile.palette.floorBase) return profile.palette.floorBase;
    return profile.palette.base;
}
function resolveMotifStack(profile) {
    const stack = [];
    if (!profile.motifs) return stack;
    for (const motifConfig of profile.motifs) {
        if (motifConfig?.enabled === false) continue;
        stack.push(motifConfig);
    }
    return stack;
}
function motifMatchesBake(config, bake) {
    const mask = config.surfaceMask ?? SURFACE_MASK_ALL;
    if (mask === SURFACE_MASK_ALL) return true;
    const i = bake._i32;
    if (mask === SURFACE_MASK_FLOOR) return !i[BI_USE_WALL_BASE];
    if (mask === SURFACE_MASK_WALL) return !!i[BI_USE_WALL_BASE];
    if (mask === SURFACE_MASK_WALL_FACE) return !!i[BI_WALL_FACE];
    if (mask === SURFACE_MASK_WALL_CELL) return !!i[BI_WALL_CELL];
    return true;
}
function motifUsesWarpedCoords(config) {
    const space = config.coordinateSpace;
    if (space === COORD_SPACE_WARPED) return true;
    if (space === COORD_SPACE_EVAL) return false;
    if (config.type === "circuitPanels") return true;
    return false;
}
function resetTranslateContext() {
    translateF32[TX_X] = 0;
    translateF32[TX_Y] = 0;
    translateI32[TX_MODE] = TRANSLATE_MODE_EVAL_AND_WARPED;
    translateI32[TX_ACTIVE] = 0;
}
function pushTranslateLayer(config) {
    readTranslateInto(LAYER_XY, 0, translateI32, TX_MODE, config);
    translateF32[TX_X] += LAYER_XY[0];
    translateF32[TX_Y] += LAYER_XY[1];
    translateI32[TX_ACTIVE] = 1;
}
function applyTranslateToSample(bakeSession, pixelIndex, warp, noise) {
    if (!translateI32[TX_ACTIVE]) {
        SAMPLE_F32[SF_EVAL_X] = bakeSession.evalX[pixelIndex];
        SAMPLE_F32[SF_EVAL_Y] = bakeSession.evalY[pixelIndex];
        SAMPLE_F32[SF_LOOKUP_X] = bakeSession.lookupX[pixelIndex];
        SAMPLE_F32[SF_LOOKUP_Y] = bakeSession.lookupY[pixelIndex];
        return;
    }
    const tx = translateF32[TX_X];
    const ty = translateF32[TX_Y];
    SAMPLE_F32[SF_EVAL_X] = bakeSession.evalX[pixelIndex] - tx;
    SAMPLE_F32[SF_EVAL_Y] = bakeSession.evalY[pixelIndex] - ty;
    if (translateI32[TX_MODE] === TRANSLATE_MODE_EVAL_ONLY) {
        SAMPLE_F32[SF_LOOKUP_X] = bakeSession.lookupX[pixelIndex] - tx;
        SAMPLE_F32[SF_LOOKUP_Y] = bakeSession.lookupY[pixelIndex] - ty;
        return;
    }
    warpPointInto(WARP_OUT, 0, SAMPLE_F32[SF_EVAL_X], SAMPLE_F32[SF_EVAL_Y], warp, noise);
    SAMPLE_F32[SF_LOOKUP_X] = WARP_OUT[0];
    SAMPLE_F32[SF_LOOKUP_Y] = WARP_OUT[1];
}
function clearMotifPasses() {
    passImpl.length = 0;
    passConfig.length = 0;
    passRunner.length = 0;
    passBlendMode.length = 0;
}
function buildMotifPasses(motifs, motifStartIndex, endIdx, bake) {
    clearMotifPasses();
    let needsPrecomputedLookup = false;
    for (let m = motifStartIndex; m < endIdx; m++) {
        const motifConfig = motifs[m];
        if (motifConfig.type === "translate") continue;
        if (!motifMatchesBake(motifConfig, bake)) continue;
        if (motifUsesWarpedCoords(motifConfig)) needsPrecomputedLookup = true;
        const motifImpl = getMotif(motifConfig.type);
        passImpl.push(motifImpl);
        passConfig.push(motifConfig);
        passRunner.push(motifImpl.compile?.(motifConfig) ?? null);
        passBlendMode.push(motifConfig.blendMode ?? BLEND_MODE_ADD);
    }
    return needsPrecomputedLookup;
}
function writeLookupForPixel(bakeSession, index, warp, warpAmp, noise) {
    if (warpAmp > 0) writeDomainWarp(bakeSession.evalX[index], bakeSession.evalY[index], warp, bakeSession.lookupX, bakeSession.lookupY, index, noise);
    else {
        bakeSession.lookupX[index] = bakeSession.evalX[index];
        bakeSession.lookupY[index] = bakeSession.evalY[index];
    }
}
export function composeSurfaceImage(bakeSession, profile, seed, rgbBuffer = null, motifStartIndex = 0, motifEndIndex = undefined) {
    const noise = bakeSession.noiseEvaluator;
    noise.setSeed(seed);
    const numPixels = bakeSession._i32[BI_WIDTH] * bakeSession._i32[BI_HEIGHT];
    if (!rgbBuffer) rgbBuffer = new Float32Array(numPixels * 3);
    const bake = bakeSession;
    const useWallBase = !!bake._i32[BI_USE_WALL_BASE];
    const base = resolvePaletteBase(profile, useWallBase);
    const warp = profile.warp;
    SAMPLE_F32[SF_SEED] = seed;
    SAMPLE_I32[SI_IS_WALL] = useWallBase ? 1 : 0;
    const motifs = resolveMotifStack(profile);
    const endIdx = motifEndIndex ?? motifs.length;
    resetTranslateContext();
    for (let m = 0; m < motifs.length; m++) {
        const motifConfig = motifs[m];
        if (motifConfig.type === "translate") pushTranslateLayer(motifConfig);
    }
    const warpedMotifs = buildMotifPasses(motifs, motifStartIndex, endIdx, bake);
    const translateReWarp = translateI32[TX_ACTIVE] && translateI32[TX_MODE] === TRANSLATE_MODE_EVAL_AND_WARPED;
    const needsPrecomputedLookup = warpedMotifs && !translateReWarp;
    const warpAmp = warp?.amplitude ?? 0;
    const passCount = passImpl.length;
    for (let i = 0; i < numPixels; i++) {
        if (motifStartIndex === 0) {
            const idx = i * 3;
            rgbBuffer[idx] = base[0];
            rgbBuffer[idx + 1] = base[1];
            rgbBuffer[idx + 2] = base[2];
            if (needsPrecomputedLookup) writeLookupForPixel(bakeSession, i, warp, warpAmp, noise);
        }
        if (passCount === 0) continue;
        noise.beginPixel();
        applyTranslateToSample(bakeSession, i, warp, noise);
        SAMPLE_F32[SF_WALL_U] = bakeSession.wallU[i];
        SAMPLE_F32[SF_WALL_V] = bakeSession.wallV[i];
        const idx = i * 3;
        for (let p = 0; p < passCount; p++) {
            RGB_F32[RF_BEFORE + RF_R] = rgbBuffer[idx];
            RGB_F32[RF_BEFORE + RF_G] = rgbBuffer[idx + 1];
            RGB_F32[RF_BEFORE + RF_B] = rgbBuffer[idx + 2];
            RGB_F32[RF_LAYER + RF_R] = RGB_F32[RF_BEFORE + RF_R];
            RGB_F32[RF_LAYER + RF_G] = RGB_F32[RF_BEFORE + RF_G];
            RGB_F32[RF_LAYER + RF_B] = RGB_F32[RF_BEFORE + RF_B];
            const runner = passRunner[p];
            if (runner) runner(SAMPLE_F32, SAMPLE_I32, RGB_F32, RF_LAYER, noise);
            else passImpl[p].apply(SAMPLE_F32, SAMPLE_I32, RGB_F32, RF_LAYER, passConfig[p], noise);
            const blendMode = passBlendMode[p];
            if (blendMode === BLEND_MODE_ADD) {
                rgbBuffer[idx] = clampByte(RGB_F32[RF_BEFORE + RF_R] + RGB_F32[RF_LAYER + RF_R]);
                rgbBuffer[idx + 1] = clampByte(RGB_F32[RF_BEFORE + RF_G] + RGB_F32[RF_LAYER + RF_G]);
                rgbBuffer[idx + 2] = clampByte(RGB_F32[RF_BEFORE + RF_B] + RGB_F32[RF_LAYER + RF_B]);
            } else if (blendMode === BLEND_MODE_REPLACE) {
                rgbBuffer[idx] = clampByte(RGB_F32[RF_LAYER + RF_R]);
                rgbBuffer[idx + 1] = clampByte(RGB_F32[RF_LAYER + RF_G]);
                rgbBuffer[idx + 2] = clampByte(RGB_F32[RF_LAYER + RF_B]);
            } else {
                blendMotifRgb(RGB_F32, RF_BLEND, RGB_F32, RF_BEFORE, RGB_F32, RF_LAYER, blendMode);
                rgbBuffer[idx] = RGB_F32[RF_BLEND + RF_R];
                rgbBuffer[idx + 1] = RGB_F32[RF_BLEND + RF_G];
                rgbBuffer[idx + 2] = RGB_F32[RF_BLEND + RF_B];
            }
        }
    }
    return rgbBuffer;
}
