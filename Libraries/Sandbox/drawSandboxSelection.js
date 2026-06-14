import { drawAabbHighlight, getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { drawPortalEdgeStrip } from "../Render/portalDraw.js";
import { strokeCircle } from "../Canvas/CanvasPath.js";
import { queryEntitiesInAabbStrict } from "../../GameState/EntityRegistry.js";
import { createAabb, aabbFromTwoPointsInto } from "../Math/Aabb2D.js";
import { cellBoundsAtOriginInto } from "../Spatial/grid/GridCoords.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { gridHasForcefield, gridHasPortal, strokeSelectedForcefieldEdge, strokeSelectedRailWallEdge } from "./gridWallEdit.js";
import { resolvePortalLinkRoute } from "./portalLinks.js";
const FLOOR_BELT_SELECTION_BOUNDS = createAabb();
const WALL_CELL_SELECTION_BOUNDS = createAabb();
const PROP_TILE_CELL_BOUNDS = createAabb();
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
 *   camera?: { px: number, py: number },
 * }} options
 */
export function drawSandboxSelectionRings(ctx, { selectedProps, showRings, selectedFloorCell = null, selectedVoxelCell = null, selectedRailEdge = null, grid = null, camera = null }) {
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
    if (selectedRailEdge && grid)
        if (gridHasPortal(grid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side) && camera) {
            const { col, row, side } = selectedRailEdge;
            const edge = grid.getCellEdge(col, row, side);
            drawPortalEdgeStrip(ctx, grid, col, row, side, edge, camera.px, camera.py, { selected: true });
            const route = resolvePortalLinkRoute(grid, col, row, side);
            if (route) {
                const { col: pCol, row: pRow, side: pSide } = route.partner;
                const partnerEdge = grid.getCellEdge(pCol, pRow, pSide);
                drawPortalEdgeStrip(ctx, grid, pCol, pRow, pSide, partnerEdge, camera.px, camera.py, { selected: true });
            }
        } else if (gridHasForcefield(grid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side)) {
            ctx.strokeStyle = "rgba(192, 132, 252, 0.95)";
            strokeSelectedForcefieldEdge(ctx, grid, selectedRailEdge, lineScale);
        } else {
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
 *   show: boolean,
 *   grid: import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid,
 *   worldProps: object[],
 * }} options
 */
export function drawSandboxPropTileCells(ctx, { show, grid, worldProps }) {
    if (!show) return;
    const lineScale = getCanvasLineScale(ctx);
    ctx.save();
    for (let i = 0; i < worldProps.length; i++) {
        const prop = worldProps[i];
        if (prop.isDead) continue;
        const { col, row } = grid.worldToGrid(prop.x, prop.y);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        cellBoundsAtOriginInto(PROP_TILE_CELL_BOUNDS, grid.minX, grid.minY, col, row, grid.cellSize);
        drawAabbHighlight(ctx, PROP_TILE_CELL_BOUNDS, { fill: "rgba(160, 255, 120, 0.1)", stroke: "rgba(160, 255, 120, 0.5)", lineWidth: lineScale });
    }
    ctx.restore();
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
