import { noise2D } from "../Noise/Perlin2D.js";

/** Write warped lookup coords into arrays without allocating per pixel. */
export function writeDomainWarp(evalX, evalY, warp, lookupX, lookupY, index) {
    const warped = warpPoint(evalX, evalY, warp);
    lookupX[index] = warped.x;
    lookupY[index] = warped.y;
}

/** Scalar warp for per-pixel translate context (no array allocation). */
export function warpPoint(evalX, evalY, warp) {
    if (!warp) {
        return { x: evalX, y: evalY };
    }
    const [offX, offY] = warp.sampleOffset ?? [0, 0];
    const freq = warp.frequency ?? 0;
    const amp = warp.amplitude ?? 0;
    const oct = warp.octaves ?? 1;
    if (amp === 0) {
        return { x: evalX, y: evalY };
    }
    return {
        x: evalX + noise2D(evalX * freq, evalY * freq, oct) * amp,
        y: evalY + noise2D((evalX + offX) * freq, (evalY + offY) * freq, oct) * amp,
    };
}
