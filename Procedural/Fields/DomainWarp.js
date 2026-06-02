import { noise2D } from "../Noise/Perlin2D.js";

/** Write warped lookup coords into arrays without allocating per pixel. */
export function writeDomainWarp(evalX, evalY, warp, lookupX, lookupY, index) {
    const [offX, offY] = warp.sampleOffset;
    const freq = warp.frequency;
    const amp = warp.amplitude;
    const oct = warp.octaves;
    lookupX[index] = evalX + noise2D(evalX * freq, evalY * freq, oct) * amp;
    lookupY[index] = evalY + noise2D((evalX + offX) * freq, (evalY + offY) * freq, oct) * amp;
}
