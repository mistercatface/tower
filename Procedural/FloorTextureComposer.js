import { parseHexColor } from "./util/color.js";
import { blendMotifRgb } from "./util/blend.js";
import { ensureNoiseInitialized } from "./Noise/Perlin2D.js";
import { applyDomainWarp } from "./Fields/DomainWarp.js";
import { getMotif } from "./MotifRegistry.js";

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

export function composeFloorPixel(surface, paintContext) {
    const { profile, shadowRgb } = paintContext;

    if (surface.blocked && !surface.isWall) {
        return shadowRgb;
    }

    const { lookupX, lookupY } = applyDomainWarp(surface.evalX, surface.evalY, profile.warp);
    const sample = { ...surface, lookupX, lookupY, seed: paintContext.seed };

    const [baseR, baseG, baseB] = resolvePaletteBase(profile, surface.isWall);
    const rgb = { r: baseR, g: baseG, b: baseB };

    for (const motifConfig of resolveMotifStack(profile)) {
        applyMotifLayer(sample, rgb, motifConfig);
    }

    return rgb;
}
