import { sampleCoords, applyTint, hash2 } from "../util/motifUtilities.js";

/**
 * 3D-beveled panel plate aligned with the warped starburst grid cells.
 */
export const circuitPanelsMotif = {
    metadata: {
        label: "Circuit panels",
        defaults: {
            type: "circuitPanels",
            coordinateSpace: "warped",
            gridSize: 16,
            density: 0.35,
            cellVariation: 4,
            groutWidth: 0.06,
            groutPeak: -10,
            groutTint: [1, 1, 1],
            bevelWidth: 0.05,
            highlightPeak: 8,
            shadowPeak: -6,
            bevelTint: [1, 1, 1],
            sunkenDarken: 6,
            sunkenShadowPeak: -5,
            sunkenHighlightPeak: 4,
            rivetRadius: 0.12,
            rivetSpacing: 0.18,
            rivetPeak: 6,
            rivetTint: [1.5, 1.5, 2.0],
            blendMode: "add",
            opacity: 1,
        },
        fields: [
            { path: "gridSize", label: "Grid size", min: 8, max: 64, step: 1 },
            { path: "density", label: "Density", min: 0.05, max: 1.0, step: 0.05 },
            { path: "cellVariation", label: "Color jitter", min: 0, max: 12, step: 0.5 },
            { path: "groutWidth", label: "Grout width", min: 0.02, max: 0.2, step: 0.01 },
            { path: "groutPeak", label: "Grout peak", min: -20, max: 20, step: 1 },
            { path: "bevelWidth", label: "Bevel width", min: 0.01, max: 0.15, step: 0.005 },
            { path: "highlightPeak", label: "Highlight peak", min: 0, max: 20, step: 1 },
            { path: "shadowPeak", label: "Shadow peak", min: -20, max: 0, step: 1 },
            { path: "sunkenDarken", label: "Sunken darken", min: 0, max: 20, step: 0.5 },
            { path: "sunkenShadowPeak", label: "Sunken shadow", min: -20, max: 0, step: 1 },
            { path: "sunkenHighlightPeak", label: "Sunken highlight", min: 0, max: 20, step: 1 },
            { path: "rivetRadius", label: "Rivet radius", min: 0.02, max: 0.25, step: 0.01 },
            { path: "rivetSpacing", label: "Rivet spacing", min: 0.05, max: 0.35, step: 0.01 },
            { path: "rivetPeak", label: "Rivet peak", min: 0, max: 20, step: 1 },
            { path: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05 },
        ],
    },
    apply(sample, rgb, config) {
        const { x, y } = sampleCoords(sample, config.coordinateSpace ?? "warped");
        
        const gridSize = config.gridSize ?? 16;
        const col = Math.floor(x / gridSize);
        const row = Math.floor(y / gridSize);
        const lx = x - col * gridSize;
        const ly = y - row * gridSize;
        
        // 1. Calculate normalized coordinates inside the cell
        const u = lx / gridSize;
        const v = ly / gridSize;
        
        // Distance to the cell boundary (0.0 at edge, 0.5 at center)
        const edgeDist = Math.min(u, 1 - u, v, 1 - v);
        
        // 2. Panel density / hash to decide if this cell is raised (active) or sunken (inactive)
        const h = hash2(col, row);
        const density = config.density ?? 1.0;
        const isActive = h <= density;
        
        // 3. Panel base fill variation
        const cellVariation = config.cellVariation ?? 4;
        let delta = (h - 0.5) * cellVariation;
        if (!isActive) {
            // Sunken panels are darker
            delta -= (config.sunkenDarken ?? 6);
        }
        applyTint(rgb, delta, [1, 1, 1]);
        
        // 4. Panel bevel / border (make it look 3D and panel-like!)
        const groutWidth = config.groutWidth ?? 0.08;
        if (edgeDist < groutWidth) {
            // Grout / shadow border
            const t = (1.0 - edgeDist / groutWidth);
            const peak = config.groutPeak ?? -10; // negative peak to darken grout lines
            const tint = config.groutTint ?? [1, 1, 1];
            applyTint(rgb, t * peak, tint);
        } else {
            // Draw a subtle inner highlights (inner bevel) just inside the grout line
            const bevelWidth = config.bevelWidth ?? 0.05;
            const distInBevel = edgeDist - groutWidth;
            if (distInBevel < bevelWidth) {
                const t = (1.0 - distInBevel / bevelWidth);
                // Highlight top-left, shadow bottom-right for a 3D bevel look
                const isTopLeft = (u < 0.5 && u - groutWidth < bevelWidth && u < v) || (v < 0.5 && v - groutWidth < bevelWidth && v < u);
                
                let peak = 0;
                if (isActive) {
                    // Raised/outset panel: top-left is highlight, bottom-right is shadow
                    peak = isTopLeft ? (config.highlightPeak ?? 8) : (config.shadowPeak ?? -6);
                } else {
                    // Sunken/inset panel: top-left is shadow, bottom-right is highlight
                    peak = isTopLeft ? (config.sunkenShadowPeak ?? -5) : (config.sunkenHighlightPeak ?? 4);
                }
                
                const tint = config.bevelTint ?? [1, 1, 1];
                applyTint(rgb, t * peak, tint);
            }
        }
        
        // 5. Optional rivet/nodes in the corners of each raised (active) panel
        if (isActive) {
            const rivetRadius = config.rivetRadius ?? 0.12; // relative to cell size
            const rivetSpacing = config.rivetSpacing ?? 0.18; // inset from corners
            const nearLeft = Math.abs(u - rivetSpacing) < rivetRadius;
            const nearRight = Math.abs(u - (1 - rivetSpacing)) < rivetRadius;
            const nearTop = Math.abs(v - rivetSpacing) < rivetRadius;
            const nearBottom = Math.abs(v - (1 - rivetSpacing)) < rivetRadius;
            
            if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
                // Find coordinate distance to closest corner node center
                const cu = u < 0.5 ? rivetSpacing : 1 - rivetSpacing;
                const cv = v < 0.5 ? rivetSpacing : 1 - rivetSpacing;
                const rDist = Math.hypot(u - cu, v - cv);
                if (rDist < rivetRadius) {
                    const t = (1.0 - rDist / rivetRadius) * (config.rivetPeak ?? 6);
                    const tint = config.rivetTint ?? [1.5, 1.5, 2.0]; // glowing blue/teal rivets
                    applyTint(rgb, t, tint);
                }
            }
        }
    }
};
