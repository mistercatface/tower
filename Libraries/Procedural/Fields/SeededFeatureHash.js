export function writeSeededFeatureCell(out, cellX, cellY, seed) {
    let h = (seed ^ Math.imul(cellX | 0, 374761393)) >>> 0;
    h = (h ^ Math.imul(cellY | 0, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    out.fx = (h & 0xffff) / 0xffff;
    out.fy = ((h >>> 16) & 0xffff) / 0xffff;
    return out;
}
