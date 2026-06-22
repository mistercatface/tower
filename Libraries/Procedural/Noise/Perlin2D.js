function lcg(seed) {
    let s = seed;
    return function () {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };
}
const PERM_SIZE = 512;
let perm = new Uint8Array(PERM_SIZE);
const permCaches = new Map();
let currentNoiseSeed = null;
export function initNoiseTable(seed) {
    if (permCaches.has(seed)) {
        perm = permCaches.get(seed);
        return;
    }
    const rand = lcg(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const temp = p[i];
        p[i] = p[j];
        p[j] = temp;
    }
    const newPerm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) newPerm[i] = p[i & 255];
    permCaches.set(seed, newPerm);
    perm = newPerm;
}
export function ensureNoiseInitialized(seed) {
    if (currentNoiseSeed !== seed) {
        initNoiseTable(seed);
        currentNoiseSeed = seed;
    }
}
let activeNoiseMemo = null;
let noiseProfileEnabled = false;
export function setNoiseProfileEnabled(enabled) {
    noiseProfileEnabled = Boolean(enabled);
}
export function setActiveNoiseMemo(memo) {
    activeNoiseMemo = memo;
}
export function createNoiseMemo(capacity = 8) {
    return { x: new Float32Array(capacity), y: new Float32Array(capacity), octaves: new Int32Array(capacity), val: new Float32Array(capacity), count: 0, profile: { calls: 0, hits: 0, overflows: 0 } };
}
export function resetNoiseProfile(memo) {
    if (!memo?.profile) return;
    memo.profile.calls = 0;
    memo.profile.hits = 0;
    memo.profile.overflows = 0;
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
export function noise2D(x, y, octaves = 2, memo = activeNoiseMemo) {
    if (memo !== null) {
        if (noiseProfileEnabled) {
            const profile = memo.profile;
            if (profile) profile.calls++;
        }
        for (let i = 0; i < memo.count; i++)
            if (memo.x[i] === x && memo.y[i] === y && memo.octaves[i] === octaves) {
                if (noiseProfileEnabled && memo.profile) memo.profile.hits++;
                return memo.val[i];
            }
    }
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
    const val = value / maxValue;
    if (memo !== null)
        if (memo.count < memo.x.length) {
            const c = memo.count;
            memo.x[c] = x;
            memo.y[c] = y;
            memo.octaves[c] = octaves;
            memo.val[c] = val;
            memo.count++;
        } else if (noiseProfileEnabled && memo.profile) memo.profile.overflows++;
    return val;
}
