import { snapLayoutOrigin } from "../../Generator/GridLayout.js";
import { Segment } from "../../Entities/Wall.js";
import { buildRackTriangle } from "./poolRackLayout.js";
import { getResolvedAssembly } from "./assemblies/assemblyRegistry.js";
import { getPoolPocketArcAngles } from "./poolTableLayoutShared.js";
export { getPoolPocketArcAngles } from "./poolTableLayoutShared.js";
/** @typedef {import("./assemblies/assemblyManifest.js").ResolvedAssemblyLayout} ResolvedAssemblyLayout */
const defaultLayout = () => getResolvedAssembly("poolTable").layout;
/** @param {ResolvedAssemblyLayout | undefined} tableLayout */
function resolveTableLayout(tableLayout) {
    return tableLayout ?? defaultLayout();
}
/** @param {number} ballRadius @param {ResolvedAssemblyLayout} tableLayout */
export function pocketRadiiForLayout(ballRadius, tableLayout) {
    const ratio = ballRadius / tableLayout.ballRadius;
    const pockets = tableLayout.pocketRadii;
    return { corner: pockets.corner * ratio, side: pockets.side * ratio, depth: pockets.depth * ratio };
}
/** @param {number} offsetX @param {number} offsetY @param {number} cellSize @param {number} cols @param {number} rows */
function getTableWorldBounds(offsetX, offsetY, cellSize, cols, rows) {
    const width = cols * cellSize;
    const height = rows * cellSize;
    return { minX: offsetX, minY: offsetY, maxX: offsetX + width, maxY: offsetY + height, centerX: offsetX + width / 2, centerY: offsetY + height / 2, width, height };
}
/** @param {ReturnType<typeof getTableWorldBounds>} table @param {number} rail */
function getPlayfieldBounds(table, rail) {
    return { minX: table.minX + rail, minY: table.minY + rail, maxX: table.maxX - rail, maxY: table.maxY - rail, centerX: table.centerX, centerY: table.centerY };
}
/** @param {ReturnType<typeof getPlayfieldBounds>} play @param {ReturnType<typeof pocketRadiiForLayout>} pockets */
function getPocketPositions(play, pockets) {
    const cr = pockets.corner;
    const sr = pockets.side;
    return [
        { x: play.minX, y: play.minY, radius: cr, kind: "corner-tl" },
        { x: play.minX, y: play.centerY, radius: sr, kind: "side-left" },
        { x: play.maxX, y: play.minY, radius: cr, kind: "corner-tr" },
        { x: play.minX, y: play.maxY, radius: cr, kind: "corner-bl" },
        { x: play.maxX, y: play.centerY, radius: sr, kind: "side-right" },
        { x: play.maxX, y: play.maxY, radius: cr, kind: "corner-br" },
    ];
}
/**
 * @param {number} centerX
 * @param {number} centerY
 * @param {ResolvedAssemblyLayout} [tableLayout]
 */
export function buildSandboxPoolTableLayout(centerX, centerY, tableLayout = defaultLayout()) {
    const layout = resolveTableLayout(tableLayout);
    const ballRadius = layout.ballRadius;
    const cellSize = layout.cellSize;
    const cols = layout.cols;
    const rows = layout.rows;
    const { offsetX, offsetY } = snapLayoutOrigin(centerX, centerY, cols, rows, cellSize);
    const table = getTableWorldBounds(offsetX, offsetY, cellSize, cols, rows);
    const rail = layout.railCells * cellSize;
    const play = getPlayfieldBounds(table, rail);
    const playfieldHeight = table.height - rail * 2;
    const headSpot = { x: play.centerX, y: play.minY + playfieldHeight * 0.75 };
    const regulationFootSpotY = play.minY + playfieldHeight * 0.25;
    const minFootSpotY = play.minY + (4 * Math.sqrt(3) + 2.5) * ballRadius;
    const footSpot = { x: play.centerX, y: Math.max(regulationFootSpotY, minFootSpotY) };
    const pocketRadii = pocketRadiiForLayout(ballRadius, layout);
    return {
        cols,
        rows,
        cellSize,
        offsetX,
        offsetY,
        table,
        play,
        rail,
        headSpot,
        footSpot,
        pockets: getPocketPositions(play, pocketRadii),
        pocketDepth: pocketRadii.depth,
        balls: { cue: headSpot, rack: buildRackTriangle(footSpot.x, footSpot.y, ballRadius) },
    };
}
/** @param {ReturnType<typeof buildSandboxPoolTableLayout>} layout */
export function buildPoolTableClearBounds(layout) {
    const pad = layout.cellSize;
    return { minX: layout.table.minX - pad, minY: layout.table.minY - pad, maxX: layout.table.maxX + pad, maxY: layout.table.maxY + pad };
}
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
 * @param {ReturnType<typeof buildSandboxPoolTableLayout>} layout
 * @param {number} ballRadius
 * @param {number} railHeight
 * @param {ResolvedAssemblyLayout} [tableLayout]
 */
export function buildPoolTableWallSegments(layout, ballRadius, railHeight, tableLayout = defaultLayout()) {
    const resolvedLayout = resolveTableLayout(tableLayout);
    const cols = layout.cols;
    const rows = layout.rows;
    const cellSize = layout.cellSize;
    const grid = new Uint8Array(cols * rows).fill(1);
    const rail = resolvedLayout.railCells;
    carveRect(grid, cols, rows, rail, rail, cols - rail * 2, rows - rail * 2);
    const carveRadius = Math.max(...layout.pockets.map((p) => p.radius)) + ballRadius / 8;
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            if (grid[r * cols + c] !== 1) continue;
            const cx = layout.offsetX + c * cellSize + cellSize / 2;
            const cy = layout.offsetY + r * cellSize + cellSize / 2;
            for (const pocket of layout.pockets) {
                const dx = cx - pocket.x;
                const dy = cy - pocket.y;
                if (dx * dx + dy * dy < carveRadius * carveRadius) {
                    grid[r * cols + c] = 0;
                    break;
                }
            }
        }
    /** @type {Segment[]} */
    const walls = [];
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            if (grid[r * cols + c] !== 1) continue;
            walls.push(new Segment(layout.offsetX + c * cellSize + cellSize / 2, layout.offsetY + r * cellSize + cellSize / 2, 0, cellSize, 0, 30, 30, false, railHeight));
        }
    const wallPocketSegmentSize = resolvedLayout.wallPocketSegmentSize;
    for (const pocket of layout.pockets) {
        const { start, end } = getPoolPocketArcAngles(pocket.kind);
        const backStart = end;
        const backEnd = start + 2 * Math.PI;
        const radius = pocket.radius;
        const size = wallPocketSegmentSize;
        const numSegments = Math.max(1, Math.ceil((radius * Math.abs(backEnd - backStart)) / (size * 1.1)));
        const angleStep = (backEnd - backStart) / numSegments;
        for (let i = 0; i < numSegments; i++) {
            const angle = backStart + i * angleStep + angleStep / 2;
            const sx = pocket.x + Math.cos(angle) * radius;
            const sy = pocket.y + Math.sin(angle) * radius;
            walls.push(new Segment(sx, sy, angle + Math.PI / 2, size, 0, 30, 30, false, railHeight));
        }
    }
    return walls;
}
// Re-export layout constants from default assembly for callers that still import them here.
export const POOL_TABLE_COLS = defaultLayout().cols;
export const POOL_TABLE_ROWS = defaultLayout().rows;
export const POOL_TABLE_RAIL_CELLS = defaultLayout().railCells;
/** @param {number} ballRadius @param {ResolvedAssemblyLayout} [tableLayout] */
export function poolPocketRadii(ballRadius, tableLayout) {
    return pocketRadiiForLayout(ballRadius, resolveTableLayout(tableLayout));
}
