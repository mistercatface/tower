import { blendMotifRgb } from "./util/blend.js";
import { ensureNoiseInitialized } from "./Noise/Perlin2D.js";
import { warpPoint, writeDomainWarp } from "./Fields/DomainWarp.js";
import { getMotif } from "./MotifRegistry.js";
import { readTranslateConfig, TRANSLATE_COORDINATE_MODES } from "./Motifs/translate.js";

const sampleScratch = {
    evalX: 0,
    evalY: 0,
    lookupX: 0,
    lookupY: 0,
    wallU: 0,
    wallV: 0,
    isWall: false,
    surfaceKind: "floor",
    seed: 0,
};
const beforeRgb = { r: 0, g: 0, b: 0 };
const layerRgb = { r: 0, g: 0, b: 0 };
const blendOut = { r: 0, g: 0, b: 0 };

function resolvePaletteBase(profile, isWall) {
    if (isWall && profile.palette.wallBase) {
        return profile.palette.wallBase;
    }
    if (!isWall && profile.palette.floorBase) {
        return profile.palette.floorBase;
    }
    return profile.palette.base;
}

function resolveMotifStack(profile) {
    const stack = [];
    if (!profile.motifs) {
        return stack;
    }
    for (const motifConfig of profile.motifs) {
        if (motifConfig?.enabled === false) {
            continue;
        }
        stack.push(motifConfig);
    }
    return stack;
}

/** Profile surfaceMask "floor" means ground (non-wall) pixels. */
function motifMatchesSurface(config, surface) {
    const mask = config.surfaceMask ?? "all";
    if (mask === "all") {
        return true;
    }
    if (mask === "floor") {
        return !surface.isWall;
    }
    if (mask === "wall") {
        return surface.isWall === true;
    }
    if (mask === "wallFace") {
        return surface.surfaceKind === "wallFace";
    }
    if (mask === "wallCell") {
        return surface.surfaceKind === "wallCell";
    }
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

export function composeSurfaceImage(samples, profile, seed) {
    ensureNoiseInitialized(seed);
    const numPixels = samples.width * samples.height;

    const rgbBuffer = new Float32Array(numPixels * 3);

    const baseFloor = resolvePaletteBase(profile, false);
    const baseWall = resolvePaletteBase(profile, true);
    const warp = profile.warp;

    sampleScratch.isWall = samples.isWall;
    sampleScratch.surfaceKind = samples.surfaceKind;
    sampleScratch.seed = seed;

    for (let i = 0; i < numPixels; i++) {
        const base = samples.isWall ? baseWall : baseFloor;
        rgbBuffer[i * 3] = base[0];
        rgbBuffer[i * 3 + 1] = base[1];
        rgbBuffer[i * 3 + 2] = base[2];
        writeDomainWarp(samples.evalX[i], samples.evalY[i], warp, samples.lookupX, samples.lookupY, i);
    }

    const motifs = resolveMotifStack(profile);
    const translateContext = createTranslateContext();

    for (let m = 0; m < motifs.length; m++) {
        const motifConfig = motifs[m];

        if (motifConfig.type === "translate") {
            pushTranslateLayer(translateContext, motifConfig);
            continue;
        }

        const motifImpl = getMotif(motifConfig.type);
        const blendMode = motifConfig.blendMode ?? "add";
        const opacity = motifConfig.opacity ?? 1;

        for (let i = 0; i < numPixels; i++) {
            applyTranslateToSample(sampleScratch, samples, i, translateContext, warp);
            sampleScratch.wallU = samples.wallU[i];
            sampleScratch.wallV = samples.wallV[i];

            if (!motifMatchesSurface(motifConfig, sampleScratch)) {
                continue;
            }

            const idx = i * 3;
            beforeRgb.r = rgbBuffer[idx];
            beforeRgb.g = rgbBuffer[idx + 1];
            beforeRgb.b = rgbBuffer[idx + 2];

            layerRgb.r = beforeRgb.r;
            layerRgb.g = beforeRgb.g;
            layerRgb.b = beforeRgb.b;
            motifImpl.apply(sampleScratch, layerRgb, motifConfig);

            blendMotifRgb(blendOut, beforeRgb, layerRgb, blendMode, opacity);
            rgbBuffer[idx] = blendOut.r;
            rgbBuffer[idx + 1] = blendOut.g;
            rgbBuffer[idx + 2] = blendOut.b;
        }
    }

    return rgbBuffer;
}
