import { noise2D } from "../Noise/Perlin2D.js";

const sWarpOut = { x: 0, y: 0 };

/** Write warped lookup coords into arrays without allocating per pixel. */
export function writeDomainWarp(evalX, evalY, warp, lookupX, lookupY, index) {
    warpPointInto(sWarpOut, evalX, evalY, warp);
    lookupX[index] = sWarpOut.x;
    lookupY[index] = sWarpOut.y;
}

/** @param {{ x: number, y: number }} out */
export function warpPointInto(out, evalX, evalY, warp) {
    if (!warp || (warp.amplitude ?? 0) === 0) {
        out.x = evalX;
        out.y = evalY;
        return out;
    }
    const [offX, offY] = warp.sampleOffset ?? [0, 0];
    const freq = warp.frequency ?? 0;
    const amp = warp.amplitude ?? 0;
    const oct = warp.octaves ?? 1;
    out.x = evalX + noise2D(evalX * freq, evalY * freq, oct) * amp;
    out.y = evalY + noise2D((evalX + offX) * freq, (evalY + offY) * freq, oct) * amp;
    return out;
}

/** Scalar warp — allocates; prefer `warpPointInto` in hot loops. */
export function warpPoint(evalX, evalY, warp) {
    return warpPointInto({ x: 0, y: 0 }, evalX, evalY, warp);
}
