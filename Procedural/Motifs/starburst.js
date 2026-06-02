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
 * Radial starbursts on a sparse grid. When domain-warped, they tear and smear into plasma flows or biological spores.
 */
export const starburstMotif = {
    apply(sample, rgb, config) {
        const { x, y } = sampleCoords(sample, config.coordinateSpace);
        
        const gridSize = config.gridSize ?? 64;
        const col = Math.floor(x / gridSize);
        const row = Math.floor(y / gridSize);
        const lx = x - col * gridSize;
        const ly = y - row * gridSize;
        const half = gridSize / 2;
        
        const h = hash2(col, row);
        const density = config.density ?? 0.2;
        
        if (h > density) return;
        
        // Offset center slightly by hash
        const cx = half + (hash2(col + 1, row) - 0.5) * (gridSize * 0.5);
        const cy = half + (hash2(col, row + 1) - 0.5) * (gridSize * 0.5);
        
        const dx = lx - cx;
        const dy = ly - cy;
        const dist = Math.hypot(dx, dy);
        
        const maxRadius = config.radius ?? (gridSize * 0.8);
        if (dist > maxRadius) return;
        
        const angle = Math.atan2(dy, dx);
        
        // Add spikes
        const spikes = config.spikes ?? 8;
        const phase = angle * spikes + h * 100;
        
        // Smooth spike shape
        const spikeShape = Math.abs(Math.cos(phase));
        const distFalloff = 1.0 - dist / maxRadius;
        
        // Core glow + spike glow
        const coreIntensity = Math.pow(distFalloff, 3) * config.peak;
        const spikeIntensity = spikeShape * distFalloff * (config.peak * 0.6);
        
        const intensity = Math.max(coreIntensity, spikeIntensity);
        
        if (intensity > 0) {
            applyTint(rgb, intensity, config.tint ?? [1, 1, 1]);
        }
    },
};
