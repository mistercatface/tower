const WARP_XY = new Float32Array(2);

export function warpPointInto(outF32, o, evalX, evalY, warp, noise) {
    if (!warp || (warp.amplitude ?? 0) === 0) {
        outF32[o] = evalX;
        outF32[o + 1] = evalY;
        return;
    }
    const [offX, offY] = warp.sampleOffset ?? [0, 0];
    const freq = warp.frequency ?? 0;
    const amp = warp.amplitude ?? 0;
    const oct = warp.octaves ?? 1;
    outF32[o] = evalX + noise.sample2D(evalX * freq, evalY * freq, oct) * amp;
    outF32[o + 1] = evalY + noise.sample2D((evalX + offX) * freq, (evalY + offY) * freq, oct) * amp;
}

export function writeDomainWarp(evalX, evalY, warp, lookupX, lookupY, index, noise) {
    warpPointInto(WARP_XY, 0, evalX, evalY, warp, noise);
    lookupX[index] = WARP_XY[0];
    lookupY[index] = WARP_XY[1];
}
