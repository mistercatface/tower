import { clampByte } from "../Color/colorMath.js";
import { blendMotifRgb } from "./util/blend.js";
import { warpPointInto, writeDomainWarp } from "./Fields/DomainWarp.js";
import { getMotif } from "./MotifRegistry.js";
import { readTranslateConfig, TRANSLATE_COORDINATE_MODES } from "./Motifs/translate.js";
const sampleScratch = { evalX: 0, evalY: 0, lookupX: 0, lookupY: 0, wallU: 0, wallV: 0, seed: 0, isWall: false, noise: null };
const sWarpScratch = { x: 0, y: 0 };
const beforeRgb = { r: 0, g: 0, b: 0 };
const layerRgb = { r: 0, g: 0, b: 0 };
const blendOut = { r: 0, g: 0, b: 0 };
const BLEND_KIND_FALLBACK = 0;
const BLEND_KIND_ADD = 1;
const BLEND_KIND_REPLACE = 2;
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
    const mask = config.surfaceMask ?? "all";
    if (mask === "all") return true;
    if (mask === "floor") return !bake.useWallBase;
    if (mask === "wall") return bake.useWallBase;
    if (mask === "wallFace") return bake.wallFace === true;
    if (mask === "wallCell") return bake.wallCell === true;
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
function applyTranslateToSample(scratch, samples, pixelIndex, translateContext, warp, noise) {
    if (!translateContext.active) {
        scratch.evalX = samples.evalX[pixelIndex];
        scratch.evalY = samples.evalY[pixelIndex];
        scratch.lookupX = samples.lookupX[pixelIndex];
        scratch.lookupY = samples.lookupY[pixelIndex];
        return;
    }
    const tx = translateContext.x;
    const ty = translateContext.y;
    scratch.evalX = samples.evalX[pixelIndex] - tx;
    scratch.evalY = samples.evalY[pixelIndex] - ty;
    if (translateContext.mode === TRANSLATE_COORDINATE_MODES.evalOnly) {
        scratch.lookupX = samples.lookupX[pixelIndex] - tx;
        scratch.lookupY = samples.lookupY[pixelIndex] - ty;
        return;
    }
    const warped = warpPointInto(sWarpScratch, scratch.evalX, scratch.evalY, warp, noise);
    scratch.lookupX = warped.x;
    scratch.lookupY = warped.y;
}
function buildMotifPasses(motifs, motifStartIndex, endIdx, bake) {
    const passes = [];
    let needsPrecomputedLookup = false;
    for (let m = motifStartIndex; m < endIdx; m++) {
        const motifConfig = motifs[m];
        if (motifConfig.type === "translate") continue;
        if (!motifMatchesBake(motifConfig, bake)) continue;
        if (motifUsesWarpedCoords(motifConfig)) needsPrecomputedLookup = true;
        const motifImpl = getMotif(motifConfig.type);
        const blendMode = motifConfig.blendMode ?? "add";
        passes.push({ motifConfig, motifImpl, runner: motifImpl.compile?.(motifConfig) ?? null, blendMode, blendKind: resolveBlendKind(blendMode) });
    }
    return { passes, needsPrecomputedLookup };
}
function writeLookupForPixel(samples, index, warp, warpAmp, noise) {
    if (warpAmp > 0) writeDomainWarp(samples.evalX[index], samples.evalY[index], warp, samples.lookupX, samples.lookupY, index, noise);
    else {
        samples.lookupX[index] = samples.evalX[index];
        samples.lookupY[index] = samples.evalY[index];
    }
}
export function composeSurfaceImage(samples, profile, seed, bakeSession, rgbBuffer = null, motifStartIndex = 0, motifEndIndex = undefined) {
    const noise = bakeSession.noiseEvaluator;
    noise.setSeed(seed);
    const numPixels = samples.width * samples.height;
    if (!rgbBuffer) rgbBuffer = new Float32Array(numPixels * 3);
    const bake = bakeSession;
    const base = resolvePaletteBase(profile, bake.useWallBase);
    const warp = profile.warp;
    sampleScratch.seed = seed;
    sampleScratch.noise = noise;
    sampleScratch.isWall = bake.useWallBase;
    const motifs = resolveMotifStack(profile);
    const endIdx = motifEndIndex ?? motifs.length;
    const translateContext = createTranslateContext();
    for (let m = 0; m < motifs.length; m++) {
        const motifConfig = motifs[m];
        if (motifConfig.type === "translate") pushTranslateLayer(translateContext, motifConfig);
    }
    const { passes: motifPasses, needsPrecomputedLookup: warpedMotifs } = buildMotifPasses(motifs, motifStartIndex, endIdx, bake);
    const translateReWarp = translateContext.active && translateContext.mode === TRANSLATE_COORDINATE_MODES.evalAndWarped;
    const needsPrecomputedLookup = warpedMotifs && !translateReWarp;
    const warpAmp = warp?.amplitude ?? 0;
    for (let i = 0; i < numPixels; i++) {
        if (motifStartIndex === 0) {
            const idx = i * 3;
            rgbBuffer[idx] = base[0];
            rgbBuffer[idx + 1] = base[1];
            rgbBuffer[idx + 2] = base[2];
            if (needsPrecomputedLookup) writeLookupForPixel(samples, i, warp, warpAmp, noise);
        }
        if (motifPasses.length === 0) continue;
        noise.beginPixel();
        applyTranslateToSample(sampleScratch, samples, i, translateContext, warp, noise);
        sampleScratch.wallU = samples.wallU[i];
        sampleScratch.wallV = samples.wallV[i];
        const idx = i * 3;
        for (let p = 0; p < motifPasses.length; p++) {
            const pass = motifPasses[p];
            beforeRgb.r = rgbBuffer[idx];
            beforeRgb.g = rgbBuffer[idx + 1];
            beforeRgb.b = rgbBuffer[idx + 2];
            layerRgb.r = beforeRgb.r;
            layerRgb.g = beforeRgb.g;
            layerRgb.b = beforeRgb.b;
            if (pass.runner) pass.runner(sampleScratch, layerRgb);
            else pass.motifImpl.apply(sampleScratch, layerRgb, pass.motifConfig);
            if (pass.blendKind === BLEND_KIND_ADD) {
                rgbBuffer[idx] = clampByte(beforeRgb.r + layerRgb.r);
                rgbBuffer[idx + 1] = clampByte(beforeRgb.g + layerRgb.g);
                rgbBuffer[idx + 2] = clampByte(beforeRgb.b + layerRgb.b);
            } else if (pass.blendKind === BLEND_KIND_REPLACE) {
                rgbBuffer[idx] = clampByte(layerRgb.r);
                rgbBuffer[idx + 1] = clampByte(layerRgb.g);
                rgbBuffer[idx + 2] = clampByte(layerRgb.b);
            } else {
                blendMotifRgb(blendOut, beforeRgb, layerRgb, pass.blendMode);
                rgbBuffer[idx] = blendOut.r;
                rgbBuffer[idx + 1] = blendOut.g;
                rgbBuffer[idx + 2] = blendOut.b;
            }
        }
    }
    sampleScratch.noise = null;
    return rgbBuffer;
}
