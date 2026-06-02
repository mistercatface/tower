import { blendMotifRgb } from "./util/blend.js";
import { ensureNoiseInitialized } from "./Noise/Perlin2D.js";
import { writeDomainWarp } from "./Fields/DomainWarp.js";
import { getMotif } from "./MotifRegistry.js";

class LRUCache {
    constructor(maxSize = 200) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }
    get(key) {
        if (!this.cache.has(key)) return null;
        const val = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, val);
        return val;
    }
    set(key, val) {
        if (this.cache.size >= this.maxSize) {
            this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(key, val);
    }
    clear() {
        this.cache.clear();
    }
}
const layerCache = new LRUCache(200);

const sampleScratch = {
    evalX: 0,
    evalY: 0,
    lookupX: 0,
    lookupY: 0,
    wallU: 0,
    wallV: 0,
    blocked: 0,
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

export function composeFloorImage(samples, profile, seed, requestKey) {
    ensureNoiseInitialized(seed);
    const numPixels = samples.width * samples.height;

    const warpHash = JSON.stringify(profile.warp ?? null);
    let currentHash = `${requestKey}|${warpHash}`;

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

    for (let m = 0; m < motifs.length; m++) {
        const motifConfig = motifs[m];
        currentHash += "|" + JSON.stringify(motifConfig);

        const cached = layerCache.get(currentHash);
        if (cached) {
            rgbBuffer.set(cached);
            continue;
        }

        const motifImpl = getMotif(motifConfig.type);
        const blendMode = motifConfig.blendMode ?? "add";
        const opacity = motifConfig.opacity ?? 1;

        for (let i = 0; i < numPixels; i++) {
            sampleScratch.evalX = samples.evalX[i];
            sampleScratch.evalY = samples.evalY[i];
            sampleScratch.lookupX = samples.lookupX[i];
            sampleScratch.lookupY = samples.lookupY[i];
            sampleScratch.wallU = samples.wallU[i];
            sampleScratch.wallV = samples.wallV[i];
            sampleScratch.blocked = samples.blocked ? samples.blocked[i] : 0;

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

        layerCache.set(currentHash, new Float32Array(rgbBuffer));
    }

    return rgbBuffer;
}
