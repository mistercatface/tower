import { clampByte } from "../util/color.js";

function sampleCoords(sample, coordinateSpace) {
    if (coordinateSpace === "warped") {
        return { x: sample.lookupX, y: sample.lookupY };
    }
    return { x: sample.evalX, y: sample.evalY };
}

function applyTint(rgb, intensity, tint) {
    rgb.r = clampByte(rgb.r + intensity * tint[0]);
    rgb.g = clampByte(rgb.g + intensity * tint[1]);
    rgb.b = clampByte(rgb.b + intensity * tint[2]);
}

/**
 * Concentric rings radiating from a center offset. Warps into organic waves.
 */
export const concentricRingsMotif = {
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
