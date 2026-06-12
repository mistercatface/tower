import { blendMotifRgb } from "./util/blend.js";
import { ensureNoiseInitialized } from "./Noise/Perlin2D.js";
import { warpPoint, writeDomainWarp } from "./Fields/DomainWarp.js";
import { getMotif } from "./MotifRegistry.js";
import { readTranslateConfig, TRANSLATE_COORDINATE_MODES } from "./Motifs/translate.js";
const sampleScratch = { evalX: 0, evalY: 0, lookupX: 0, lookupY: 0, wallU: 0, wallV: 0, seed: 0 };
const beforeRgb = { r: 0, g: 0, b: 0 };
const layerRgb = { r: 0, g: 0, b: 0 };
const blendOut = { r: 0, g: 0, b: 0 };
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
/** Profile surfaceMask "floor" means ground (non-wall) pixels. */
function motifMatchesBake(config, bake) {
    const mask = config.surfaceMask ?? "all";
    if (mask === "all") return true;
    if (mask === "floor") return !bake.useWallBase;
    if (mask === "wall") return bake.useWallBase;
    if (mask === "wallFace") return bake.wallFace === true;
    if (mask === "wallCell") return bake.wallCell === true;
    return true;
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
function applyTranslateToSample(scratch, samples, pixelIndex, translateContext, warp) {
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
    const warped = warpPoint(scratch.evalX, scratch.evalY, warp);
    scratch.lookupX = warped.x;
    scratch.lookupY = warped.y;
}
export function composeSurfaceImage(samples, profile, seed, bake = { useWallBase: false }) {
    ensureNoiseInitialized(seed);
    const numPixels = samples.width * samples.height;
    const rgbBuffer = new Float32Array(numPixels * 3);
    const base = resolvePaletteBase(profile, bake.useWallBase);
    const warp = profile.warp;
    sampleScratch.seed = seed;
    for (let i = 0; i < numPixels; i++) {
        rgbBuffer[i * 3] = base[0];
        rgbBuffer[i * 3 + 1] = base[1];
        rgbBuffer[i * 3 + 2] = base[2];
        writeDomainWarp(samples.evalX[i], samples.evalY[i], warp, samples.lookupX, samples.lookupY, i);
    }
    const motifs = resolveMotifStack(profile);
    const translateContext = createTranslateContext();
    /** @type {{ motifConfig: object, motifImpl: object, blendMode: string }[]} */
    const motifPasses = [];
    for (let m = 0; m < motifs.length; m++) {
        const motifConfig = motifs[m];
        if (motifConfig.type === "translate") {
            pushTranslateLayer(translateContext, motifConfig);
            continue;
        }
        if (!motifMatchesBake(motifConfig, bake)) continue;
        motifPasses.push({ motifConfig, motifImpl: getMotif(motifConfig.type), blendMode: motifConfig.blendMode ?? "add" });
    }
    for (let p = 0; p < motifPasses.length; p++) {
        const { motifImpl, motifConfig, blendMode } = motifPasses[p];
        for (let i = 0; i < numPixels; i++) {
            applyTranslateToSample(sampleScratch, samples, i, translateContext, warp);
            sampleScratch.wallU = samples.wallU[i];
            sampleScratch.wallV = samples.wallV[i];
            const idx = i * 3;
            beforeRgb.r = rgbBuffer[idx];
            beforeRgb.g = rgbBuffer[idx + 1];
            beforeRgb.b = rgbBuffer[idx + 2];
            layerRgb.r = beforeRgb.r;
            layerRgb.g = beforeRgb.g;
            layerRgb.b = beforeRgb.b;
            motifImpl.apply(sampleScratch, layerRgb, motifConfig);
            blendMotifRgb(blendOut, beforeRgb, layerRgb, blendMode);
            rgbBuffer[idx] = blendOut.r;
            rgbBuffer[idx + 1] = blendOut.g;
            rgbBuffer[idx + 2] = blendOut.b;
        }
    }
    return rgbBuffer;
}
