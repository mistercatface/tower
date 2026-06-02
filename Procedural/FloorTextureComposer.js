import { parseHexColor } from "./util/color.js";
import { blendMotifRgb } from "./util/blend.js";
import { ensureNoiseInitialized } from "./Noise/Perlin2D.js";
import { applyDomainWarp } from "./Fields/DomainWarp.js";
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

export function clearLayerCache() {
    layerCache.clear();
}

export function createPaintContext(profile, seed) {
    ensureNoiseInitialized(seed);
    const shadow = parseHexColor(profile.palette.shadow);
    return {
        profile,
        seed,
        shadowRgb: { r: shadow.r, g: shadow.g, b: shadow.b },
    };
}

function resolvePaletteBase(profile, isWall) {
    if (isWall && profile.palette.wallBase) {
        return profile.palette.wallBase;
    }
    if (!isWall && profile.palette.floorBase) {
        return profile.palette.floorBase;
    }
    return profile.palette.base;
}

function pushEnabledMotifs(target, list) {
    if (!list) {
        return;
    }
    for (const motifConfig of list) {
        if (motifConfig?.enabled === false) {
            continue;
        }
        target.push(motifConfig);
    }
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

function applyMotifLayer(sample, rgb, motifConfig) {
    if (!motifMatchesSurface(motifConfig, sample)) {
        return;
    }
    const before = { r: rgb.r, g: rgb.g, b: rgb.b };
    const layer = { r: rgb.r, g: rgb.g, b: rgb.b };
    getMotif(motifConfig.type).apply(sample, layer, motifConfig);
    const blended = blendMotifRgb(before, layer, motifConfig.blendMode ?? "add", motifConfig.opacity ?? 1);
    rgb.r = blended.r;
    rgb.g = blended.g;
    rgb.b = blended.b;
}

export function composeFloorImage(samples, paintContext, requestKey) {
    const { profile, shadowRgb, seed } = paintContext;
    const numPixels = samples.width * samples.height;

    const warpHash = JSON.stringify(profile.warp ?? null);
    let currentHash = `${requestKey}|${warpHash}`;

    const rgbBuffer = new Float32Array(numPixels * 3);

    const baseFloor = resolvePaletteBase(profile, false);
    const baseWall = resolvePaletteBase(profile, true);

    // Apply domain warp and fill base
    for (let i = 0; i < numPixels; i++) {
        if (samples.blocked[i] && !samples.isWall) {
            rgbBuffer[i * 3] = shadowRgb.r;
            rgbBuffer[i * 3 + 1] = shadowRgb.g;
            rgbBuffer[i * 3 + 2] = shadowRgb.b;
        } else {
            const base = samples.isWall ? baseWall : baseFloor;
            rgbBuffer[i * 3] = base[0];
            rgbBuffer[i * 3 + 1] = base[1];
            rgbBuffer[i * 3 + 2] = base[2];
        }

        const { lookupX, lookupY } = applyDomainWarp(samples.evalX[i], samples.evalY[i], profile.warp);
        samples.lookupX[i] = lookupX;
        samples.lookupY[i] = lookupY;
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

        for (let i = 0; i < numPixels; i++) {
            if (samples.blocked[i] && !samples.isWall) continue;

            const sample = {
                evalX: samples.evalX[i],
                evalY: samples.evalY[i],
                lookupX: samples.lookupX[i],
                lookupY: samples.lookupY[i],
                wallU: samples.wallU[i],
                wallV: samples.wallV[i],
                blocked: samples.blocked[i],
                isWall: samples.isWall,
                surfaceKind: samples.surfaceKind,
                seed: seed
            };

            if (!motifMatchesSurface(motifConfig, sample)) {
                continue;
            }

            const beforeR = rgbBuffer[i * 3];
            const beforeG = rgbBuffer[i * 3 + 1];
            const beforeB = rgbBuffer[i * 3 + 2];

            const layerRgb = { r: beforeR, g: beforeG, b: beforeB };
            motifImpl.apply(sample, layerRgb, motifConfig);

            const blended = blendMotifRgb(
                { r: beforeR, g: beforeG, b: beforeB },
                layerRgb,
                motifConfig.blendMode ?? "add",
                motifConfig.opacity ?? 1
            );

            rgbBuffer[i * 3] = blended.r;
            rgbBuffer[i * 3 + 1] = blended.g;
            rgbBuffer[i * 3 + 2] = blended.b;
        }

        layerCache.set(currentHash, new Float32Array(rgbBuffer));
    }

    return rgbBuffer;
}
