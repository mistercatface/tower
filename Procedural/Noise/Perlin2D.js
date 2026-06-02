function lcg(seed) {
    let s = seed;
    return function () {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };
}

const PERM_SIZE = 512;
const perm = new Uint8Array(PERM_SIZE);
let currentNoiseSeed = null;

export function initNoiseTable(seed) {
    const rand = lcg(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const temp = p[i];
        p[i] = p[j];
        p[j] = temp;
    }
    for (let i = 0; i < 512; i++) {
        perm[i] = p[i & 255];
    }
}

export function ensureNoiseInitialized(seed) {
    if (currentNoiseSeed !== seed) {
        initNoiseTable(seed);
        currentNoiseSeed = seed;
    }
}

function grad(hash, x, y) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function rawNoise2D(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;

    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);

    const X = xi & 255;
    const Y = yi & 255;

    const g00 = grad(perm[X + perm[Y]], xf, yf);
    const g10 = grad(perm[X + 1 + perm[Y]], xf - 1, yf);
    const g01 = grad(perm[X + perm[Y + 1]], xf, yf - 1);
    const g11 = grad(perm[X + 1 + perm[Y + 1]], xf - 1, yf - 1);

    const ix0 = g00 + u * (g10 - g00);
    const ix1 = g01 + u * (g11 - g01);

    return ix0 + v * (ix1 - ix0);
}

export function noise2D(x, y, octaves = 2) {
    let value = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
        value += rawNoise2D(x * frequency, y * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    return value / maxValue;
}
