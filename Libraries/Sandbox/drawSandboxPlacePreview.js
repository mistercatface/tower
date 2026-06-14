import { getWorldPropDefinitions } from "../Props/PropCatalog.js";
import { drawAabbHighlight, getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { aabbFromTwoPointsInto, createAabb } from "../Math/Aabb2D.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { canStampFloorBeltAt, canStampPassagePowerSourceAt } from "./floorOccupancy.js";
import { ensureObstacleGridAtWorld, hitTestRailWallEdgeAtWorld, strokeSelectedForcefieldEdge, strokeSelectedPortalEdge, strokeSelectedRailWallEdge } from "./gridWallEdit.js";
import { isGridFloorBeltSpawnAsset, isGridPassagePowerSourceSpawnAsset } from "./sandboxCapabilities.js";
import { getPropAsset } from "../Props/PropCatalog.js";
const PREVIEW_CELL_BOUNDS = createAabb();
/** @param {string} propTypeId */
function resolveSpawnPreviewRadius(propTypeId) {
    const def = getWorldPropDefinitions()[propTypeId];
    if (!def) return 8;
    if (def.halfExtents) return Math.max(def.halfExtents.x, def.halfExtents.y);
    return def.radius ?? 8;
}
/**
 * @param {object} state
 * @param {{
 *   isMapGenPlaceMode: () => boolean,
 *   isWallPlaceMode: () => boolean,
 *   getWallStampMode: () => string,
 *   getSpawnPropId: () => string,
 * }} session
 * @param {number} worldX
 * @param {number} worldY
 */
export function resolveSandboxPlacePreview(state, session, worldX, worldY) {
    if (session.isMapGenPlaceMode()) return null;
    const grid = state.obstacleGrid;
    if (session.isWallPlaceMode()) {
        const mode = session.getWallStampMode();
        if (mode === "voxel") {
            const { col, row } = ensureObstacleGridAtWorld(state, worldX, worldY);
            return { kind: "cell", col, row, valid: true, tint: "voxel" };
        }
        const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
        if (!hit) return null;
        return { kind: "edge", col: hit.col, row: hit.row, side: hit.side, edgeKind: mode, valid: true };
    }
    const asset = getPropAsset(session.getSpawnPropId());
    if (!asset) return null;
    if (isGridFloorBeltSpawnAsset(asset)) {
        const { col, row } = grid.worldToGrid(worldX, worldY);
        if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
        return { kind: "cell", col, row, valid: canStampFloorBeltAt(state, col, row), tint: "floor" };
    }
    if (isGridPassagePowerSourceSpawnAsset(asset)) {
        const { col, row } = ensureObstacleGridAtWorld(state, worldX, worldY);
        return { kind: "cell", col, row, valid: canStampPassagePowerSourceAt(state, col, row), tint: "power" };
    }
    return { kind: "circle", x: worldX, y: worldY, radius: resolveSpawnPreviewRadius(session.getSpawnPropId()), valid: true };
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof resolveSandboxPlacePreview>} preview
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function drawSandboxPlacePreview(ctx, preview, grid) {
    if (!preview) return;
    const lineScale = getCanvasLineScale(ctx);
    const valid = preview.valid !== false;
    ctx.save();
    if (preview.kind === "circle") {
        ctx.strokeStyle = valid ? "rgba(100, 255, 160, 0.9)" : "rgba(255, 96, 96, 0.85)";
        ctx.fillStyle = valid ? "rgba(100, 255, 160, 0.12)" : "rgba(255, 96, 96, 0.1)";
        ctx.lineWidth = lineScale;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(preview.x, preview.y, preview.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        return;
    }
    if (preview.kind === "cell") {
        const { x, y } = grid.gridToWorld(preview.col, preview.row);
        const half = grid.cellSize * 0.5;
        const tint = preview.tint ?? "floor";
        const stroke =
            tint === "voxel"
                ? valid
                    ? "rgba(255, 183, 77, 0.9)"
                    : "rgba(255, 96, 96, 0.85)"
                : tint === "power"
                  ? valid
                      ? "rgba(255, 213, 79, 0.9)"
                      : "rgba(255, 96, 96, 0.85)"
                  : valid
                    ? "rgba(100, 255, 160, 0.9)"
                    : "rgba(255, 96, 96, 0.85)";
        const fill =
            tint === "voxel"
                ? valid
                    ? "rgba(255, 183, 77, 0.14)"
                    : "rgba(255, 96, 96, 0.1)"
                : tint === "power"
                  ? valid
                      ? "rgba(255, 213, 79, 0.14)"
                      : "rgba(255, 96, 96, 0.1)"
                  : valid
                    ? "rgba(100, 255, 160, 0.12)"
                    : "rgba(255, 96, 96, 0.1)";
        drawAabbHighlight(ctx, aabbFromTwoPointsInto(PREVIEW_CELL_BOUNDS, x - half, y - half, x + half, y + half), { fill, stroke, lineWidth: lineScale, dash: [4, 3] });
        ctx.restore();
        return;
    }
    const edge = { col: preview.col, row: preview.row, side: preview.side };
    if (preview.edgeKind === "forcefield") {
        ctx.strokeStyle = "rgba(192, 132, 252, 0.95)";
        strokeSelectedForcefieldEdge(ctx, grid, edge, lineScale);
    } else if (preview.edgeKind === "portal") {
        ctx.strokeStyle = "rgba(186, 104, 255, 0.95)";
        strokeSelectedPortalEdge(ctx, grid, edge, lineScale);
    } else {
        ctx.strokeStyle = "rgba(255, 183, 77, 0.95)";
        strokeSelectedRailWallEdge(ctx, grid, edge, lineScale);
    }
    ctx.restore();
}
