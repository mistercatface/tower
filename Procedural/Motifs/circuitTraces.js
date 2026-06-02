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

function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
        return Math.hypot(px - x1, py - y1);
    }
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Grid-aligned continuous circuit traces. When warped, they snake organically.
 */
export const circuitTracesMotif = {
    apply(sample, rgb, config) {
        const { x, y } = sampleCoords(sample, config.coordinateSpace);
        
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
            minDist = Math.min(minDist, distToSegment(lx, ly, half, half, half, 0));
            activeCount++;
        }
        if (hasSouth) {
            minDist = Math.min(minDist, distToSegment(lx, ly, half, half, half, gridSize));
            activeCount++;
        }
        if (hasEast) {
            minDist = Math.min(minDist, distToSegment(lx, ly, half, half, gridSize, half));
            activeCount++;
        }
        if (hasWest) {
            minDist = Math.min(minDist, distToSegment(lx, ly, half, half, 0, half));
            activeCount++;
        }
        
        if (hasNorthEast) {
            minDist = Math.min(minDist, distToSegment(lx, ly, half, half, gridSize, 0));
            activeCount++;
        }
        if (hasSouthWest) {
            minDist = Math.min(minDist, distToSegment(lx, ly, half, half, 0, gridSize));
            activeCount++;
        }
        if (hasSouthEast) {
            minDist = Math.min(minDist, distToSegment(lx, ly, half, half, gridSize, gridSize));
            activeCount++;
        }
        if (hasNorthWest) {
            minDist = Math.min(minDist, distToSegment(lx, ly, half, half, 0, 0));
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
            if (distToCenter < padRadius) {
                padIntensity = (1.0 - distToCenter / padRadius) * config.peak;
            }
        }
        
        if (minDist < halfWidth || padIntensity > 0) {
            let lineIntensity = 0;
            if (minDist < halfWidth) {
                lineIntensity = (1.0 - minDist / halfWidth) * config.peak;
            }
            const intensity = Math.max(lineIntensity, padIntensity);
            applyTint(rgb, intensity, config.tint ?? [1, 1, 1]);
        }
    },
};
