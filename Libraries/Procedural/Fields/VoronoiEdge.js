import { deriveFeatureSeed, writeSeededFeatureCell } from "./SeededFeatureHash.js";
const featureScratch = { fx: 0, fy: 0 };
export class WorleyEdgeField {
    constructor(rootSeed, salt, density) {
        this.seed = deriveFeatureSeed(rootSeed, salt);
        this.density = density;
    }
    sampleEdge(worldX, worldY) {
        return voronoiEdgeMetric(worldX, worldY, this.density, this.seed);
    }
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
            const { fx, fy } = writeSeededFeatureCell(featureScratch, cx, cy, seed);
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
