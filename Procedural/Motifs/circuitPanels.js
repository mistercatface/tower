import { clampByte } from "../util/color.js";

function sampleCoords(sample, coordinateSpace) {
    if (coordinateSpace === "warped") {
        return { x: sample.lookupX, y: sample.lookupY };
    }
    return { x: sample.evalX, y: sample.evalY };
}

function hash2(x, y) {
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
    return h - Math.floor(h);
}

/**
 * 3D-beveled panel plate aligned with the warped starburst grid cells.
 */
export const circuitPanelsMotif = {
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
        
        // 2. Panel density / hash to decide if this cell is rendered
        const h = hash2(col, row);
        const density = config.density ?? 1.0;
        if (h > density) return;
        
        // 3. Panel base fill variation
        const cellVariation = config.cellVariation ?? 4;
        const delta = (h - 0.5) * cellVariation;
        rgb.r = clampByte(rgb.r + delta);
        rgb.g = clampByte(rgb.g + delta);
        rgb.b = clampByte(rgb.b + delta);
        
        // 4. Panel bevel / border (make it look 3D and panel-like!)
        const groutWidth = config.groutWidth ?? 0.08;
        if (edgeDist < groutWidth) {
            // Grout / shadow border
            const t = (1.0 - edgeDist / groutWidth);
            const peak = config.groutPeak ?? -10; // negative peak to darken grout lines
            const tint = config.groutTint ?? [1, 1, 1];
            rgb.r = clampByte(rgb.r + t * peak * tint[0]);
            rgb.g = clampByte(rgb.g + t * peak * tint[1]);
            rgb.b = clampByte(rgb.b + t * peak * tint[2]);
        } else {
            // Draw a subtle inner highlights (inner bevel) just inside the grout line
            const bevelWidth = config.bevelWidth ?? 0.05;
            const distInBevel = edgeDist - groutWidth;
            if (distInBevel < bevelWidth) {
                const t = (1.0 - distInBevel / bevelWidth);
                // Highlight top-left, shadow bottom-right for a 3D bevel look
                const isTopLeft = (u < 0.5 && u - groutWidth < bevelWidth && u < v) || (v < 0.5 && v - groutWidth < bevelWidth && v < u);
                const peak = isTopLeft ? (config.highlightPeak ?? 8) : (config.shadowPeak ?? -6);
                const tint = config.bevelTint ?? [1, 1, 1];
                rgb.r = clampByte(rgb.r + t * peak * tint[0]);
                rgb.g = clampByte(rgb.g + t * peak * tint[1]);
                rgb.b = clampByte(rgb.b + t * peak * tint[2]);
            }
        }
        
        // 5. Optional rivet/nodes in the corners of each panel
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
                rgb.r = clampByte(rgb.r + t * tint[0]);
                rgb.g = clampByte(rgb.g + t * tint[1]);
                rgb.b = clampByte(rgb.b + t * tint[2]);
            }
        }
    }
};
