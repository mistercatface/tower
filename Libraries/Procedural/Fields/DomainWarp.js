const sWarpOut = { x: 0, y: 0 };
export function writeDomainWarp(evalX, evalY, warp, lookupX, lookupY, index, noise) {
    warpPointInto(sWarpOut, evalX, evalY, warp, noise);
    lookupX[index] = sWarpOut.x;
    lookupY[index] = sWarpOut.y;
}
export function warpPointInto(out, evalX, evalY, warp, noise) {
    if (!warp || (warp.amplitude ?? 0) === 0) {
        out.x = evalX;
        out.y = evalY;
        return out;
    }
    const [offX, offY] = warp.sampleOffset ?? [0, 0];
    const freq = warp.frequency ?? 0;
    const amp = warp.amplitude ?? 0;
    const oct = warp.octaves ?? 1;
    out.x = evalX + noise.sample2D(evalX * freq, evalY * freq, oct) * amp;
    out.y = evalY + noise.sample2D((evalX + offX) * freq, (evalY + offY) * freq, oct) * amp;
    return out;
}
export function warpPoint(evalX, evalY, warp, noise) {
    return warpPointInto({ x: 0, y: 0 }, evalX, evalY, warp, noise);
}
