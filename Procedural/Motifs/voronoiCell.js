import { clampByte } from "../util/color.js";
import { voronoiEdgeMetric } from "../Fields/VoronoiEdge.js";

function sampleCoords(sample, coordinateSpace) {
    if (coordinateSpace === "warped") {
        return { x: sample.lookupX, y: sample.lookupY };
    }
    return { x: sample.evalX, y: sample.evalY };
}

export const voronoiCellMotif = {
    apply(sample, rgb, config) {
        const { x, y } = sampleCoords(sample, config.coordinateSpace);
        const edge = voronoiEdgeMetric(x, y, config.density, sample.seed + config.seedSalt);
        if (edge >= config.edgeWidth) {
            return;
        }
        const intensity = (1.0 - edge / config.edgeWidth) * config.peak;
        rgb.r = clampByte(rgb.r + intensity * config.tint[0]);
        rgb.g = clampByte(rgb.g + intensity * config.tint[1]);
        rgb.b = clampByte(rgb.b + intensity * config.tint[2]);
    },
};
