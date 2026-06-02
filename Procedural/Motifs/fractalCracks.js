import { clampByte } from "../util/color.js";
import { noise2D } from "../Noise/Perlin2D.js";

function fbmRidged(x, y, octaves) {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    for (let i = 0; i < octaves; i++) {
        // Noise is typically -1 to 1
        let n = noise2D(x * freq, y * freq, 1);
        n = 1.0 - Math.abs(n);
        // Sharpen the ridge
        n = n * n;
        sum += n * amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    return sum;
}

export const fractalCracksMotif = {
    apply(sample, rgb, config) {
        const x = sample.evalX ?? sample.worldX;
        const y = sample.evalY ?? sample.worldY;
        
        const freq = config.frequency ?? 0.01;
        const octaves = config.octaves ?? 3;
        const [ox, oy] = config.offset ?? [0, 0];
        
        const v = fbmRidged((x + ox) * freq, (y + oy) * freq, octaves);
        
        const threshold = config.threshold ?? 0.8;
        if (v < threshold) {
            return;
        }
        
        // Normalize 0 to 1 over the ridge peak
        let t = (v - threshold) / (1 - threshold);
        
        // Apply edge smoothstep
        t = t * t * (3 - 2 * t);

        const peak = config.peak ?? 10;
        const tint = config.tint ?? [1, 1, 1];
        
        rgb.r = clampByte(rgb.r - t * peak * tint[0]);
        rgb.g = clampByte(rgb.g - t * peak * tint[1]);
        rgb.b = clampByte(rgb.b - t * peak * tint[2]);
    }
};
