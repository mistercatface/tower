export function deriveFeatureSeed(rootSeed, salt) {
    let h = rootSeed >>> 0 || 1;
    for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 2654435761) >>> 0;
    return h || 1;
}
export function writeSeededFeatureCell(out, cellX, cellY, seed) {
    let h = (seed ^ Math.imul(cellX | 0, 374761393)) >>> 0;
    h = (h ^ Math.imul(cellY | 0, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    out.fx = (h & 0xffff) / 0xffff;
    out.fy = ((h >>> 16) & 0xffff) / 0xffff;
    return out;
}
export function seededFeatureCell(cellX, cellY, seed) {
    return writeSeededFeatureCell({ fx: 0, fy: 0 }, cellX, cellY, seed);
}
