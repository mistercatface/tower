import { voronoiEdgeMetric } from "../Fields/VoronoiEdge.js";
import { sampleCoords, applyTint } from "../util/motifUtilities.js";
export const voronoiCellMotif = {
    metadata: {
        label: "Voronoi cells",
        defaults: { type: "voronoiCell", coordinateSpace: "warped", density: 0.035, edgeWidth: 0.08, peak: 4, seedSalt: 0, tint: [0.2, 0.4, 0.6], blendMode: "add" },
        fields: [
            { path: "density", label: "Density", min: 0.01, max: 0.08, step: 0.002 },
            { path: "edgeWidth", label: "Edge width", min: 0.02, max: 0.2, step: 0.01 },
            { path: "peak", label: "Peak", min: 0, max: 16, step: 1 },
        ],
    },
    apply(sample, rgb, config) {
        const { x, y } = sampleCoords(sample, config.coordinateSpace);
        const edge = voronoiEdgeMetric(x, y, config.density, sample.seed + config.seedSalt);
        if (edge >= config.edgeWidth) return;
        const intensity = (1.0 - edge / config.edgeWidth) * config.peak;
        applyTint(rgb, intensity, config.tint);
    },
};
