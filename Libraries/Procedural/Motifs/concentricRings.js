import { sampleCoords, applyTint } from "../util/motifUtilities.js";
/**
 * Concentric rings radiating from a center offset. Warps into organic waves.
 */
export const concentricRingsMotif = {
    metadata: {
        label: "Concentric rings",
        defaults: { type: "concentricRings", coordinateSpace: "warped", frequency: 0.02, ringWidth: 0.08, peak: 10, offset: [0, 0], tint: [0.3, 0.8, 1.2], opacity: 0.7, blendMode: "add" },
        fields: [
            { path: "frequency", label: "Frequency", min: 0.005, max: 0.1, step: 0.001 },
            { path: "ringWidth", label: "Ring width", min: 0.01, max: 0.4, step: 0.01 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
            { path: "offset.0", label: "Center X", min: -200, max: 200, step: 5 },
            { path: "offset.1", label: "Center Y", min: -200, max: 200, step: 5 },
            { path: "tint.0", label: "Tint R", min: -5, max: 5, step: 0.1 },
            { path: "tint.1", label: "Tint G", min: -5, max: 5, step: 0.1 },
            { path: "tint.2", label: "Tint B", min: -5, max: 5, step: 0.1 },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
    apply(sample, rgb, config) {
        const { x, y } = sampleCoords(sample, config.coordinateSpace);
        const [cx, cy] = config.offset ?? [0, 0];
        const dist = Math.hypot(x - cx, y - cy);
        const ringVal = dist * config.frequency;
        const distToNearestRing = Math.abs(ringVal - Math.round(ringVal));
        const threshold = config.ringWidth ?? 0.1;
        if (distToNearestRing < threshold) {
            const intensity = (1.0 - distToNearestRing / threshold) * config.peak;
            applyTint(rgb, intensity, config.tint ?? [1, 1, 1]);
        }
    },
};
