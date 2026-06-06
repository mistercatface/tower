function hashCell(cx, cy, seed) {
    let h = (seed ^ Math.imul(cx | 0, 374761393)) >>> 0;
    h = (h ^ Math.imul(cy | 0, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return { fx: (h & 0xffff) / 0xffff, fy: ((h >>> 16) & 0xffff) / 0xffff };
}
/** Returns edge metric (small on cell borders, larger in cell interiors). */
export function voronoiEdgeMetric(worldX, worldY, density, seed) {
    const px = worldX * density;
    const py = worldY * density;
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    let minDist = Infinity;
    let secondMin = Infinity;
    for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
            const cx = ix + dx;
            const cy = iy + dy;
            const { fx, fy } = hashCell(cx, cy, seed);
            const featureX = cx + fx;
            const featureY = cy + fy;
            const dist = Math.hypot(px - featureX, py - featureY);
            if (dist < minDist) {
                secondMin = minDist;
                minDist = dist;
            } else if (dist < secondMin) secondMin = dist;
        }
    return secondMin - minDist;
}
