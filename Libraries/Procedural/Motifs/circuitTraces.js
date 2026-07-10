import { rotateXYIntoF32, ENGINE_F32, M_VEC_A } from "../../Math/math.js";
import { distanceToLineSegment } from "../../Math/math.js";
import { sampleCoords, applyTint, hash2 } from "../util/motifUtilities.js";
/**
 * Grid-aligned continuous circuit traces. When warped, they snake organically.
 */
export const circuitTracesMotif = {
    metadata: {
        label: "Circuit traces",
        defaults: { type: "circuitTraces", coordinateSpace: "warped", gridSize: 24, lineWidth: 2, density: 0.5, diagDensity: 0.15, peak: 10, tint: [0.9, 0.4, 1.1], padEnabled: true, blendMode: "add" },
        fields: [
            { path: "gridSize", label: "Grid size", min: 8, max: 80, step: 2 },
            { path: "lineWidth", label: "Line width", min: 0.5, max: 10, step: 0.5 },
            { path: "density", label: "Density", min: 0.1, max: 0.9, step: 0.05 },
            { path: "diagDensity", label: "Diag density", min: 0.0, max: 0.8, step: 0.05 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
            { path: "angle", label: "Angle", min: -360, max: 360, step: 1 },
            { path: "tint.0", label: "Tint R", min: -5, max: 5, step: 0.1 },
            { path: "tint.1", label: "Tint G", min: -5, max: 5, step: 0.1 },
            { path: "tint.2", label: "Tint B", min: -5, max: 5, step: 0.1 },
        ],
    },
    apply(sample, rgb, config) {
        const coords = sampleCoords(sample, config.coordinateSpace);
        let x = coords.x;
        let y = coords.y;
        const angle = config.angle ?? 0;
        if (angle !== 0) {
            const rad = (angle * Math.PI) / 180;
            const cosA = Math.cos(rad);
            const sinA = Math.sin(rad);
            rotateXYIntoF32(ENGINE_F32, M_VEC_A, coords.x, coords.y, cosA, sinA);
            x = ENGINE_F32[M_VEC_A];
            y = ENGINE_F32[M_VEC_A + 1];
        }
        const gridSize = config.gridSize ?? 24;
        const col = Math.floor(x / gridSize);
        const row = Math.floor(y / gridSize);
        const lx = x - col * gridSize;
        const ly = y - row * gridSize;
        const half = gridSize / 2;
        const density = config.density ?? 0.5;
        const diagDensity = config.diagDensity ?? 0.15;
        // Cardinal connections
        const hasNorth = hash2(col + 0.5, row) < density;
        const hasSouth = hash2(col + 0.5, row + 1) < density;
        const hasEast = hash2(col + 1, row + 0.5) < density;
        const hasWest = hash2(col, row + 0.5) < density;
        // Diagonal connections
        const hasNorthEast = hash2(col + 1, row) < diagDensity;
        const hasSouthWest = hash2(col, row + 1) < diagDensity;
        const hasSouthEast = hash2(col + 1, row + 1) < diagDensity;
        const hasNorthWest = hash2(col, row) < diagDensity;
        let minDist = Infinity;
        let activeCount = 0;
        // Add segments to check
        if (hasNorth) {
            minDist = Math.min(minDist, distanceToLineSegment(lx, ly, half, half, half, 0));
            activeCount++;
        }
        if (hasSouth) {
            minDist = Math.min(minDist, distanceToLineSegment(lx, ly, half, half, half, gridSize));
            activeCount++;
        }
        if (hasEast) {
            minDist = Math.min(minDist, distanceToLineSegment(lx, ly, half, half, gridSize, half));
            activeCount++;
        }
        if (hasWest) {
            minDist = Math.min(minDist, distanceToLineSegment(lx, ly, half, half, 0, half));
            activeCount++;
        }
        if (hasNorthEast) {
            minDist = Math.min(minDist, distanceToLineSegment(lx, ly, half, half, gridSize, 0));
            activeCount++;
        }
        if (hasSouthWest) {
            minDist = Math.min(minDist, distanceToLineSegment(lx, ly, half, half, 0, gridSize));
            activeCount++;
        }
        if (hasSouthEast) {
            minDist = Math.min(minDist, distanceToLineSegment(lx, ly, half, half, gridSize, gridSize));
            activeCount++;
        }
        if (hasNorthWest) {
            minDist = Math.min(minDist, distanceToLineSegment(lx, ly, half, half, 0, 0));
            activeCount++;
        }
        const lineWidth = config.lineWidth ?? 2;
        const halfWidth = lineWidth / 2;
        // Check junction pad (only if we have connections and want pads)
        const padEnabled = config.padEnabled ?? true;
        let padIntensity = 0;
        if (padEnabled && activeCount > 0) {
            const distToCenter = Math.hypot(lx - half, ly - half);
            const padRadius = lineWidth * 1.5;
            if (distToCenter < padRadius) padIntensity = (1.0 - distToCenter / padRadius) * config.peak;
        }
        if (minDist < halfWidth || padIntensity > 0) {
            let lineIntensity = 0;
            if (minDist < halfWidth) lineIntensity = (1.0 - minDist / halfWidth) * config.peak;
            const intensity = Math.max(lineIntensity, padIntensity);
            applyTint(rgb, intensity, config.tint ?? [1, 1, 1]);
        }
    },
};
