import { parseHexColor } from "./util/color.js";
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

function resolveMotifStack(profile, isWall) {
    const shared = profile.sharedMotifs ?? [];
    if (isWall) {
        return [...shared, ...(profile.wallMotifs ?? profile.motifs ?? [])];
    }
    return [...shared, ...(profile.floorMotifs ?? profile.motifs ?? [])];
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

    for (const motifConfig of resolveMotifStack(profile, surface.isWall)) {
        getMotif(motifConfig.type).apply(sample, rgb, motifConfig);
    }

    return rgb;
}
