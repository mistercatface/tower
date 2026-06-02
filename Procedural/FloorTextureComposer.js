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

export function composeFloorPixel(surface, paintContext) {
    const { profile, shadowRgb } = paintContext;

    if (surface.blocked && !surface.isWall) {
        return shadowRgb;
    }

    const { lookupX, lookupY } = applyDomainWarp(surface.evalX, surface.evalY, profile.warp);
    const sample = { ...surface, lookupX, lookupY };

    const [baseR, baseG, baseB] = profile.palette.base;
    const rgb = { r: baseR, g: baseG, b: baseB };

    for (const motifConfig of profile.motifs) {
        getMotif(motifConfig.type).apply(sample, rgb, motifConfig);
    }

    return rgb;
}
