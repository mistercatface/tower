import { sampleCoords, applyTint } from "../util/motifUtilities.js";

function hash2(x, y) {
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
    return h - Math.floor(h);
}

/**
 * Radial starbursts on a sparse grid. When domain-warped, they tear and smear into plasma flows or biological spores.
 */
export const starburstMotif = {
    metadata: {
        label: "Starburst nodes",
        defaults: {
            type: "starburst",
            coordinateSpace: "warped",
            gridSize: 64,
            density: 0.25,
            radius: 28,
            spikes: 8,
            peak: 12,
            tint: [1.5, 0.5, 0.2],
            opacity: 0.85,
            blendMode: "add",
        },
        fields: [
            { path: "gridSize", label: "Grid size", min: 16, max: 128, step: 4 },
            { path: "density", label: "Density", min: 0.05, max: 1.0, step: 0.05 },
            { path: "radius", label: "Radius", min: 4, max: 64, step: 1 },
            { path: "spikes", label: "Spikes", min: 0, max: 20, step: 1 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
            { path: "tint.0", label: "Tint R", min: -5, max: 5, step: 0.1 },
            { path: "tint.1", label: "Tint G", min: -5, max: 5, step: 0.1 },
            { path: "tint.2", label: "Tint B", min: -5, max: 5, step: 0.1 },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
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
