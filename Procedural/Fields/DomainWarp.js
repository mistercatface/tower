import { noise2D } from "../Noise/Perlin2D.js";

export function applyDomainWarp(evalX, evalY, warp) {
    const [offX, offY] = warp.sampleOffset;
    const warpX = noise2D(evalX * warp.frequency, evalY * warp.frequency, warp.octaves) * warp.amplitude;
    const warpY =
        noise2D((evalX + offX) * warp.frequency, (evalY + offY) * warp.frequency, warp.octaves) * warp.amplitude;
    return { lookupX: evalX + warpX, lookupY: evalY + warpY };
}
