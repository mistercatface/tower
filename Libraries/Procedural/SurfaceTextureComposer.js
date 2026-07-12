import { clampByte } from "../Color/colorMath.js";
import { blendMotifRgb } from "./util/blend.js";
import { SF_EVAL_X, SF_EVAL_Y, SF_LOOKUP_X, SF_LOOKUP_Y, SF_WALL_U, SF_WALL_V, SF_SEED, SF_COUNT, SI_IS_WALL, SI_COUNT, RF_R, RF_G, RF_B } from "./util/motifUtilities.js";
import { writeDomainWarp, warpPointInto } from "./Fields/DomainWarp.js";
import { getMotif } from "./MotifRegistry.js";
import { readTranslateConfig, TRANSLATE_COORDINATE_MODES } from "./Motifs/translate.js";
import { BI_WIDTH, BI_HEIGHT, BI_USE_WALL_BASE, BI_WALL_FACE, BI_WALL_CELL } from "../WorldSurface/worldSurface.js";
import { SURFACE_MASK_ALL, SURFACE_MASK_FLOOR, SURFACE_MASK_WALL, SURFACE_MASK_WALL_FACE, SURFACE_MASK_WALL_CELL } from "../../Core/engineEnums.js";
export { SF_EVAL_X, SF_EVAL_Y, SF_LOOKUP_X, SF_LOOKUP_Y, SF_WALL_U, SF_WALL_V, SF_SEED, SF_COUNT, SI_IS_WALL, SI_COUNT, RF_R, RF_G, RF_B };
const SAMPLE_F32 = new Float32Array(SF_COUNT);
const SAMPLE_I32 = new Int32Array(SI_COUNT);
const RGB_F32 = new Float32Array(9);
const RF_BEFORE = 0;
const RF_LAYER = 3;
const RF_BLEND = 6;
const WARP_OUT = { x: 0, y: 0 };
const BLEND_KIND_FALLBACK = 0;
const BLEND_KIND_ADD = 1;
const BLEND_KIND_REPLACE = 2;
const passImpl = [];
const passConfig = [];
const passRunner = [];
const passBlendKind = [];
const passBlendMode = [];
function resolveBlendKind(blendMode) {
    if (blendMode === "add") return BLEND_KIND_ADD;
    if (blendMode === "replace") return BLEND_KIND_REPLACE;
    return BLEND_KIND_FALLBACK;
}
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
    if (space === "warped") return true;
    if (space === "eval") return false;
    if (config.type === "circuitPanels") return true;
    return false;
}
function createTranslateContext() {
    return { x: 0, y: 0, mode: TRANSLATE_COORDINATE_MODES.evalAndWarped, active: false };
}
function pushTranslateLayer(context, config) {
    const layer = readTranslateConfig(config);
    context.x += layer.x;
    context.y += layer.y;
    context.mode = layer.mode;
    context.active = true;
}
function applyTranslateToSample(bakeSession, pixelIndex, translateContext, warp, noise) {
    if (!translateContext.active) {
        SAMPLE_F32[SF_EVAL_X] = bakeSession.evalX[pixelIndex];
        SAMPLE_F32[SF_EVAL_Y] = bakeSession.evalY[pixelIndex];
        SAMPLE_F32[SF_LOOKUP_X] = bakeSession.lookupX[pixelIndex];
        SAMPLE_F32[SF_LOOKUP_Y] = bakeSession.lookupY[pixelIndex];
        return;
    }
    const tx = translateContext.x;
    const ty = translateContext.y;
    SAMPLE_F32[SF_EVAL_X] = bakeSession.evalX[pixelIndex] - tx;
    SAMPLE_F32[SF_EVAL_Y] = bakeSession.evalY[pixelIndex] - ty;
    if (translateContext.mode === TRANSLATE_COORDINATE_MODES.evalOnly) {
        SAMPLE_F32[SF_LOOKUP_X] = bakeSession.lookupX[pixelIndex] - tx;
        SAMPLE_F32[SF_LOOKUP_Y] = bakeSession.lookupY[pixelIndex] - ty;
        return;
    }
    warpPointInto(WARP_OUT, SAMPLE_F32[SF_EVAL_X], SAMPLE_F32[SF_EVAL_Y], warp, noise);
    SAMPLE_F32[SF_LOOKUP_X] = WARP_OUT.x;
    SAMPLE_F32[SF_LOOKUP_Y] = WARP_OUT.y;
}
function clearMotifPasses() {
    passImpl.length = 0;
    passConfig.length = 0;
    passRunner.length = 0;
    passBlendKind.length = 0;
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
        const blendMode = motifConfig.blendMode ?? "add";
        passImpl.push(motifImpl);
        passConfig.push(motifConfig);
        passRunner.push(motifImpl.compile?.(motifConfig) ?? null);
        passBlendKind.push(resolveBlendKind(blendMode));
        passBlendMode.push(blendMode);
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
    const translateContext = createTranslateContext();
    for (let m = 0; m < motifs.length; m++) {
        const motifConfig = motifs[m];
        if (motifConfig.type === "translate") pushTranslateLayer(translateContext, motifConfig);
    }
    const warpedMotifs = buildMotifPasses(motifs, motifStartIndex, endIdx, bake);
    const translateReWarp = translateContext.active && translateContext.mode === TRANSLATE_COORDINATE_MODES.evalAndWarped;
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
        applyTranslateToSample(bakeSession, i, translateContext, warp, noise);
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
            const blendKind = passBlendKind[p];
            if (blendKind === BLEND_KIND_ADD) {
                rgbBuffer[idx] = clampByte(RGB_F32[RF_BEFORE + RF_R] + RGB_F32[RF_LAYER + RF_R]);
                rgbBuffer[idx + 1] = clampByte(RGB_F32[RF_BEFORE + RF_G] + RGB_F32[RF_LAYER + RF_G]);
                rgbBuffer[idx + 2] = clampByte(RGB_F32[RF_BEFORE + RF_B] + RGB_F32[RF_LAYER + RF_B]);
            } else if (blendKind === BLEND_KIND_REPLACE) {
                rgbBuffer[idx] = clampByte(RGB_F32[RF_LAYER + RF_R]);
                rgbBuffer[idx + 1] = clampByte(RGB_F32[RF_LAYER + RF_G]);
                rgbBuffer[idx + 2] = clampByte(RGB_F32[RF_LAYER + RF_B]);
            } else {
                blendMotifRgb(RGB_F32, RF_BLEND, RGB_F32, RF_BEFORE, RGB_F32, RF_LAYER, passBlendMode[p]);
                rgbBuffer[idx] = RGB_F32[RF_BLEND + RF_R];
                rgbBuffer[idx + 1] = RGB_F32[RF_BLEND + RF_G];
                rgbBuffer[idx + 2] = RGB_F32[RF_BLEND + RF_B];
            }
        }
    }
    return rgbBuffer;
}
