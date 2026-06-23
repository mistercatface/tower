import { traceClosedPolygon } from "../../Canvas/CanvasPath.js";
import { getGridWallDamageSession, resolveWallDamageTintRatio } from "../../Sandbox/gridWallDamage.js";
import { resolveCellWallHeightAtIdx } from "../../Spatial/grid/gridCellTopology.js";
import { colRowToIndex } from "../../Spatial/grid/GridUtils.js";
import { resolveWallCapHeightPx } from "../../World/wallGridBake.js";
import { projectRailWallTopCornersInto, traceProjectedFaceBand } from "./ProjectedWallDraw.js";
/** @param {number} damageRatio 0 = none, 1 = fully damaged (white → red multiply) */
export function wallDamageMultiplyFillStyle(damageRatio) {
    const t = Math.min(1, Math.max(0, damageRatio));
    const channel = Math.round(255 * (1 - t));
    return `rgb(255,${channel},${channel})`;
}
/** @param {CanvasRenderingContext2D} ctx @param {number} damageRatio @param {() => void} tracePath */
export function fillWallDamageOverlay(ctx, damageRatio, tracePath) {
    if (damageRatio <= 0) return;
    ctx.save();
    ctx.beginPath();
    tracePath();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = wallDamageMultiplyFillStyle(damageRatio);
    ctx.fill();
    ctx.restore();
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./ProjectedWallDraw.js").ProjectedWallBand} faceBottom
 * @param {import("./ProjectedWallDraw.js").ProjectedWallBand} faceTop
 * @param {number} damageRatio
 */
export function applyProjectedWallFaceDamageOverlay(ctx, faceBottom, faceTop, damageRatio) {
    fillWallDamageOverlay(ctx, damageRatio, () => traceProjectedFaceBand(ctx, faceBottom, faceTop));
}
/** @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number }[]} corners @param {number} damageRatio */
export function applyProjectedCapDamageOverlay(ctx, corners, damageRatio) {
    fillWallDamageOverlay(ctx, damageRatio, () => {
        ctx.beginPath();
        traceClosedPolygon(ctx, corners);
    });
}
const sRoofCorners = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
];
/**
 * Multiply-tint damaged voxel roof caps after the baked roof pass.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 */
export function drawDamagedVoxelRoofOverlays(ctx, state, viewport) {
    const session = getGridWallDamageSession(state);
    if (!session?.entries.size) return;
    const grid = state.obstacleGrid;
    const settings = state.worldSurfaces?.settings;
    if (!settings) return;
    for (const entry of session.entries.values()) {
        if (entry.kind !== "voxel") continue;
        const ratio = resolveWallDamageTintRatio(session, entry);
        if (ratio <= 0) continue;
        const cellBounds = grid.getCellBounds(entry.col, entry.row);
        if (!viewport.aabbInBounds(cellBounds, "chunks")) continue;
        const idx = colRowToIndex(entry.col, entry.row, grid.cols);
        const capHeight = resolveCellWallHeightAtIdx(grid, idx);
        if (capHeight <= 0) continue;
        const z = resolveWallCapHeightPx(capHeight, settings);
        projectRailWallTopCornersInto(
            sRoofCorners,
            {
                outerP1x: cellBounds.minX,
                outerP1y: cellBounds.minY,
                outerP2x: cellBounds.maxX,
                outerP2y: cellBounds.minY,
                innerP2x: cellBounds.maxX,
                innerP2y: cellBounds.maxY,
                innerP1x: cellBounds.minX,
                innerP1y: cellBounds.maxY,
                wallCapHeight: z,
            },
            viewport,
        );
        applyProjectedCapDamageOverlay(ctx, sRoofCorners, ratio);
    }
}
