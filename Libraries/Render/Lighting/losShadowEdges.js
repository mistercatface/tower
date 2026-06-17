import { cellEdgeEndpoints, resolveCellWallHeightAtIdx } from "../../Spatial/grid/gridCellTopology.js";
import { gridSideOutwardVector, cellInRect } from "../../Spatial/grid/GridUtils.js";
import { projectWallShadowQuadScreenInto } from "./losShadowMath.js";
const sP1 = { x: 0, y: 0 };
const sP2 = { x: 0, y: 0 };
/**
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ x1: number, y1: number, x2: number, y2: number, nx: number, ny: number, wallTopZ: number }[]} out
 */
export function collectLosShadowEdges(grid, out) {
    out.length = 0;
    const cols = grid.cols;
    const rows = grid.rows;
    const cells = grid.grid;
    for (let row = 0; row < rows; row++) {
        const rowOffset = row * cols;
        for (let col = 0; col < cols; col++) {
            const idx = rowOffset + col;
            const level = cells[idx];
            if (level === 0) continue;
            const wallTopZ = resolveCellWallHeightAtIdx(grid, idx);
            for (let side = 0; side < 4; side++) {
                const { nc, nr } = neighborColRow(col, row, side);
                let neighborLevel = 0;
                if (cellInRect(nc, nr, cols, rows)) neighborLevel = cells[nc + nr * cols];
                if (neighborLevel >= level) continue;
                cellEdgeEndpoints(grid, col, row, side, sP1, sP2, 0);
                const outward = gridSideOutwardVector(side);
                out.push({
                    x1: sP1.x,
                    y1: sP1.y,
                    x2: sP2.x,
                    y2: sP2.y,
                    nx: outward.x,
                    ny: outward.y,
                    wallTopZ,
                });
            }
        }
    }
}
function neighborColRow(col, row, side) {
    if (side === 0) return { nc: col, nr: row - 1 };
    if (side === 1) return { nc: col + 1, nr: row };
    if (side === 2) return { nc: col, nr: row + 1 };
    return { nc: col - 1, nr: row };
}
/**
 * @param {{ x1: number, y1: number, x2: number, y2: number, nx: number, ny: number, wallTopZ: number }[]} edges
 * @param {number} lightX
 * @param {number} lightY
 * @param {number} range
 * @param {number} lightZ
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 * @param {import("../../Spatial/iso/ElevationCamera.js").ElevationCamera} camera
 * @param {Float32Array | number[]} quadScratch
 * @param {(flatVerts: Float32Array | number[], vertCount: number) => void} emitQuad
 */
export function forEachLosShadowQuadInRange(edges, lightX, lightY, range, lightZ, viewport, camera, quadScratch, emitQuad) {
    const rSq = range * range;
    for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const midX = (edge.x1 + edge.x2) * 0.5;
        const midY = (edge.y1 + edge.y2) * 0.5;
        const closestX = clamp(edge.x1, edge.x2, lightX);
        const closestY = clamp(edge.y1, edge.y2, lightY);
        const dx = lightX - closestX;
        const dy = lightY - closestY;
        if (dx * dx + dy * dy > rSq) continue;
        if (edge.nx * (midX - lightX) + edge.ny * (midY - lightY) <= 0) continue;
        projectWallShadowQuadScreenInto(quadScratch, viewport, camera, lightX, lightY, lightZ, edge.x1, edge.y1, edge.x2, edge.y2, edge.wallTopZ);
        emitQuad(quadScratch, 4);
    }
}
function clamp(a, b, v) {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    return v < lo ? lo : v > hi ? hi : v;
}
