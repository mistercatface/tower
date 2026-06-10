import { Segment } from "../../../../Entities/Wall.js";
/** @param {Uint8Array} grid @param {number} cols @param {number} rows @param {number} x @param {number} y @param {number} w @param {number} h */
function carveRect(grid, cols, rows, x, y, w, h) {
    for (let r = y; r < y + h && r < rows; r++) {
        if (r < 0) continue;
        for (let c = x; c < x + w && c < cols; c++) {
            if (c < 0) continue;
            grid[r * cols + c] = 0;
        }
    }
}
/**
 * @param {ReturnType<typeof import("../../poolTableLayout.js").buildSandboxPoolTableLayout>} layout
 * @param {import("../assemblyManifest.js").ResolvedAssemblyManifest} resolved
 */
export function buildGridRailWithVoidCarveWalls(layout, resolved) {
    const { arena } = resolved;
    const cols = layout.cols;
    const rows = layout.rows;
    const cellSize = layout.cellSize;
    const grid = new Uint8Array(cols * rows).fill(1);
    const railCells = arena.grid.railCells;
    carveRect(grid, cols, rows, railCells, railCells, cols - railCells * 2, rows - railCells * 2);
    const carveRadius = Math.max(...layout.voids.map((v) => v.radius)) + arena.walls.voidCarveExtraRadius;
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            if (grid[r * cols + c] !== 1) continue;
            const cx = layout.offsetX + c * cellSize + cellSize / 2;
            const cy = layout.offsetY + r * cellSize + cellSize / 2;
            for (const voidCircle of layout.voids) {
                const dx = cx - voidCircle.x;
                const dy = cy - voidCircle.y;
                if (dx * dx + dy * dy < carveRadius * carveRadius) {
                    grid[r * cols + c] = 0;
                    break;
                }
            }
        }
    const wallsConfig = arena.walls;
    const segment = wallsConfig.segment ?? {};
    const padding = segment.padding ?? 0;
    const maxHealth = segment.maxHealth ?? 30;
    const health = segment.health ?? maxHealth;
    const railHeight = wallsConfig.railHeight;
    /** @type {Segment[]} */
    const walls = [];
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            if (grid[r * cols + c] !== 1) continue;
            walls.push(new Segment(layout.offsetX + c * cellSize + cellSize / 2, layout.offsetY + r * cellSize + cellSize / 2, 0, cellSize, padding, maxHealth, health, false, railHeight));
        }
    const arcSegmentSize = wallsConfig.voidBackArcSegmentSize;
    for (const voidCircle of layout.voids) {
        const opening = voidCircle.wallCarve?.openingArc;
        if (!opening || typeof opening.start !== "number" || typeof opening.end !== "number") continue;
        const backStart = opening.end;
        const backEnd = opening.start + Math.PI * 2;
        const radius = voidCircle.radius;
        const numSegments = Math.max(1, Math.ceil((radius * Math.abs(backEnd - backStart)) / (arcSegmentSize * 1.1)));
        const angleStep = (backEnd - backStart) / numSegments;
        for (let i = 0; i < numSegments; i++) {
            const angle = backStart + i * angleStep + angleStep / 2;
            const sx = voidCircle.x + Math.cos(angle) * radius;
            const sy = voidCircle.y + Math.sin(angle) * radius;
            walls.push(new Segment(sx, sy, angle + Math.PI / 2, arcSegmentSize, padding, maxHealth, health, false, railHeight));
        }
    }
    return walls;
}
export {};
