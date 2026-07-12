import { sampleCoordX, sampleCoordY, applyTint, hash2 } from "../util/motifUtilities.js";
/**
 * Continuous Truchet arc pipes. When warped, they turn into tangled organic tubes.
 */
export const celticWeaveMotif = {
    metadata: {
        label: "Celtic weave",
        defaults: { type: "celticWeave", coordinateSpace: "warped", gridSize: 32, pipeWidth: 4, peak: 10, tint: [0.8, 0.9, 1.1], blendMode: "add" },
        fields: [
            { path: "gridSize", label: "Grid size", min: 8, max: 64, step: 2 },
            { path: "pipeWidth", label: "Pipe width", min: 1, max: 12, step: 0.5 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
            { path: "tint.0", label: "Tint R", min: -5, max: 5, step: 0.1 },
            { path: "tint.1", label: "Tint G", min: -5, max: 5, step: 0.1 },
            { path: "tint.2", label: "Tint B", min: -5, max: 5, step: 0.1 },
        ],
    },
    apply(sf, si, rf, ro, config, noise) {
        const x = sampleCoordX(sf, config.coordinateSpace);
        const y = sampleCoordY(sf, config.coordinateSpace);
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
            applyTint(rf, ro, intensity, config.tint ?? [1, 1, 1]);
        }
    },
};
