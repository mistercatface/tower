import { drawAabbHighlight, getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { strokeCircle } from "../Canvas/CanvasPath.js";
import { queryEntitiesInAabbStrict } from "../../GameState/EntityRegistry.js";
import { createAabb, aabbFromTwoPointsInto } from "../Math/Aabb2D.js";
import { strokeSelectedRailWallEdge } from "./gridWallEdit.js";
const FLOOR_BELT_SELECTION_BOUNDS = createAabb();
const WALL_CELL_SELECTION_BOUNDS = createAabb();
/** @param {object} state @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry @param {import("../Math/Aabb2D.js").Aabb2D} bounds */
export function findSandboxPropsInWorldRect(state, registry, bounds) {
    return queryEntitiesInAabbStrict(registry, bounds, { kinds: ["worldProp"], hitTest: "center" });
}
/** @param {object} prop */
function selectionRingRadius(prop, lineScale) {
    const base = prop.getBoundingRadius?.() ?? prop.radius ?? 8;
    return base + 3 * lineScale;
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   selectedProps: object[],
 *   showRings: boolean,
 *   selectedFloorCell?: { col: number, row: number } | null,
 *   selectedVoxelCell?: { col: number, row: number } | null,
 *   selectedRailEdge?: { col: number, row: number, side: number } | null,
 *   grid?: import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid | null,
 * }} options
 */
export function drawSandboxSelectionRings(ctx, { selectedProps, showRings, selectedFloorCell = null, selectedVoxelCell = null, selectedRailEdge = null, grid = null }) {
    if (!showRings) return;
    const lineScale = getCanvasLineScale(ctx);
    ctx.save();
    ctx.strokeStyle = "rgba(120, 200, 255, 0.65)";
    ctx.lineWidth = lineScale;
    for (let i = 0; i < selectedProps.length; i++) {
        const prop = selectedProps[i];
        strokeCircle(ctx, prop.x, prop.y, selectionRingRadius(prop, lineScale));
    }
    if (selectedFloorCell && grid) {
        const { x, y } = grid.gridToWorld(selectedFloorCell.col, selectedFloorCell.row);
        const half = grid.cellSize * 0.5;
        drawAabbHighlight(ctx, aabbFromTwoPointsInto(FLOOR_BELT_SELECTION_BOUNDS, x - half, y - half, x + half, y + half), {
            fill: "rgba(120, 200, 255, 0.1)",
            stroke: "rgba(120, 200, 255, 0.75)",
            lineWidth: lineScale,
            dash: [4, 3],
        });
    }
    if (selectedVoxelCell && grid) {
        const { x, y } = grid.gridToWorld(selectedVoxelCell.col, selectedVoxelCell.row);
        const half = grid.cellSize * 0.5;
        drawAabbHighlight(ctx, aabbFromTwoPointsInto(WALL_CELL_SELECTION_BOUNDS, x - half, y - half, x + half, y + half), {
            fill: "rgba(255, 152, 0, 0.12)",
            stroke: "rgba(255, 152, 0, 0.85)",
            lineWidth: lineScale,
            dash: [4, 3],
        });
    }
    if (selectedRailEdge && grid) {
        ctx.strokeStyle = "rgba(255, 152, 0, 0.9)";
        strokeSelectedRailWallEdge(ctx, grid, selectedRailEdge, lineScale);
    }
    ctx.restore();
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ marqueeRect: import("../Math/Aabb2D.js").Aabb2D | null }} options
 */
export function drawSandboxMarquee(ctx, { marqueeRect }) {
    if (!marqueeRect) return;
    drawAabbHighlight(ctx, marqueeRect, { fill: "rgba(120, 200, 255, 0.08)", stroke: "rgba(120, 200, 255, 0.55)", lineWidth: 1, dash: [4, 3] });
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   selectedProps: object[],
 *   showRings: boolean,
 *   marqueeRect: import("../Math/Aabb2D.js").Aabb2D | null,
 * }} options
 */
export function drawSandboxSelectionOverlay(ctx, { selectedProps, showRings, marqueeRect }) {
    drawSandboxSelectionRings(ctx, { selectedProps, showRings });
    drawSandboxMarquee(ctx, { marqueeRect });
}
