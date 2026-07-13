import { hashSaltString } from "../../Math/math.js";
function lcg(seed) {
    let s = seed;
    return function () {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };
}
const permCaches = new Map();
function permForSeed(seed) {
    const key = seed >>> 0 || 1;
    let perm = permCaches.get(key);
    if (perm) return perm;
    const rand = lcg(key);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const temp = p[i];
        p[i] = p[j];
        p[j] = temp;
    }
    perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    permCaches.set(key, perm);
    return perm;
}
function grad(hash, x, y) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
function rawNoise2D(perm, x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const X = xi & 255;
    const Y = yi & 255;
    const pY = perm[Y];
    const pY1 = perm[Y + 1];
    const g00 = grad(perm[X + pY], xf, yf);
    const g10 = grad(perm[X + 1 + pY], xf - 1, yf);
    const g01 = grad(perm[X + pY1], xf, yf - 1);
    const g11 = grad(perm[X + 1 + pY1], xf - 1, yf - 1);
    const ix0 = g00 + u * (g10 - g00);
    const ix1 = g01 + u * (g11 - g01);
    return ix0 + v * (ix1 - ix0);
}
export class SeededNoise2D {
    constructor(seed = 0, memoCapacity = 8) {
        this.seed = seed >>> 0 || 1;
        this.perm = permForSeed(this.seed);
        this.memoX = new Float32Array(memoCapacity);
        this.memoY = new Float32Array(memoCapacity);
        this.memoOctaves = new Int32Array(memoCapacity);
        this.memoVal = new Float32Array(memoCapacity);
        this.memoCount = 0;
    }
    static fromDerived(rootSeed, salt) {
        return new SeededNoise2D(hashSaltString(rootSeed, salt));
    }
    setSeed(seed) {
        const next = seed >>> 0 || 1;
        if (this.seed === next) return;
        this.seed = next;
        this.perm = permForSeed(next);
    }
    beginPixel() {
        this.memoCount = 0;
    }
    sample2D(x, y, octaves = 2) {
        for (let i = 0; i < this.memoCount; i++) if (this.memoX[i] === x && this.memoY[i] === y && this.memoOctaves[i] === octaves) return this.memoVal[i];
        let value = 0;
        let amplitude = 1.0;
        let frequency = 1.0;
        let maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            value += rawNoise2D(this.perm, x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= 0.5;
            frequency *= 2.0;
        }
        const val = value / maxValue;
        if (this.memoCount < this.memoX.length) {
            const c = this.memoCount;
            this.memoX[c] = x;
            this.memoY[c] = y;
            this.memoOctaves[c] = octaves;
            this.memoVal[c] = val;
            this.memoCount++;
        }
        return val;
    }
}
