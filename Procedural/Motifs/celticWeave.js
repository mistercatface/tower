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

function hash2(x, y) {
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
    return h - Math.floor(h);
}

/**
 * Continuous Truchet arc pipes. When warped, they turn into tangled organic tubes.
 */
export const celticWeaveMotif = {
    apply(sample, rgb, config) {
        const { x, y } = sampleCoords(sample, config.coordinateSpace);
        
        const gridSize = config.gridSize ?? 32;
        const col = Math.floor(x / gridSize);
        const row = Math.floor(y / gridSize);
        const lx = x - col * gridSize;
        const ly = y - row * gridSize;
        const half = gridSize / 2;
        
        const h = hash2(col, row);
        
        let d1, d2;
        if (h < 0.5) {
            // Arcs at Top-Left and Bottom-Right
            d1 = Math.abs(Math.hypot(lx, ly) - half);
            d2 = Math.abs(Math.hypot(lx - gridSize, ly - gridSize) - half);
        } else {
            // Arcs at Top-Right and Bottom-Left
            d1 = Math.abs(Math.hypot(lx - gridSize, ly) - half);
            d2 = Math.abs(Math.hypot(lx, ly - gridSize) - half);
        }
        
        const minDist = Math.min(d1, d2);
        
        const pipeWidth = config.pipeWidth ?? 4;
        const halfWidth = pipeWidth / 2;
        
        if (minDist < halfWidth) {
            // Add a rounded profile (bright in center, darker at edges)
            const profile = Math.cos((minDist / halfWidth) * (Math.PI / 2));
            const intensity = profile * config.peak;
            applyTint(rgb, intensity, config.tint ?? [1, 1, 1]);
        }
    },
};
