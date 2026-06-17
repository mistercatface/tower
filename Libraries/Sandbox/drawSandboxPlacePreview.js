import { getWorldPropDefinitions } from "../Props/PropCatalog.js";
import { drawAabbHighlight, getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { centeredAabbInto, createAabb } from "../Math/Aabb2D.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { canStampFloorBeltAt, canStampPassagePowerSourceAt } from "./floorOccupancy.js";
import { ensureObstacleGridAtWorld, hitTestRailWallEdgeAtWorld, strokeSelectedForcefieldEdge, strokeSelectedRailWallEdge } from "./gridWallEdit.js";
import { isGridFloorBeltSpawnAsset, isGridPassagePowerSourceSpawnAsset, isRoomNodeSpawnAsset, isPuzzleTemplateSpawnAsset } from "./sandboxCapabilities.js";
import { resolveRoomNodePlacePreview } from "../RoomGraph/index.js";
import { resolveBeltCratePuzzlePlacePreview } from "../RoomGraph/puzzleTemplateBeltCrate.js";
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
 *   getSpawnRoomNodeCols: () => number,
 *   getSpawnRoomNodeRows: () => number,
 *   getSpawnPuzzleAreaCols: () => number,
 *   getSpawnPuzzleAreaRows: () => number,
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
    if (isRoomNodeSpawnAsset(asset)) {
        const { col, row } = grid.worldToGrid(worldX, worldY);
        return resolveRoomNodePlacePreview(state, col, row, session.getSpawnRoomNodeCols(), session.getSpawnRoomNodeRows());
    }
    if (isPuzzleTemplateSpawnAsset(asset)) {
        const { col, row } = grid.worldToGrid(worldX, worldY);
        return resolveBeltCratePuzzlePlacePreview(state, col, row, session.getSpawnPuzzleAreaCols(), session.getSpawnPuzzleAreaRows());
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
        drawAabbHighlight(ctx, centeredAabbInto(PREVIEW_CELL_BOUNDS, x, y, grid.cellSize, grid.cellSize), { fill, stroke, lineWidth: lineScale, dash: [4, 3] });
        ctx.restore();
        return;
    }
    if (preview.kind === "cellRect") {
        for (let i = 0; i < preview.cells.length; i++) {
            const cell = preview.cells[i];
            const { x, y } = grid.gridToWorld(cell.col, cell.row);
            const clear = cell.clear;
            let fill = clear ? "rgba(120, 180, 255, 0.14)" : "rgba(255, 96, 96, 0.16)";
            let stroke = clear ? "rgba(120, 180, 255, 0.85)" : "rgba(255, 96, 96, 0.9)";
            if (preview.tint === "puzzle") {
                fill = clear ? "rgba(167, 139, 250, 0.12)" : "rgba(255, 96, 96, 0.16)";
                stroke = clear ? "rgba(167, 139, 250, 0.85)" : "rgba(255, 96, 96, 0.9)";
            }
            drawAabbHighlight(ctx, centeredAabbInto(PREVIEW_CELL_BOUNDS, x, y, grid.cellSize, grid.cellSize), { fill, stroke, lineWidth: lineScale, dash: [4, 3] });
        }
        ctx.restore();
        return;
    }
    const edge = { col: preview.col, row: preview.row, side: preview.side };
    if (preview.edgeKind === "forcefield") {
        ctx.strokeStyle = "rgba(192, 132, 252, 0.95)";
        strokeSelectedForcefieldEdge(ctx, grid, edge, lineScale);
    } else {
        ctx.strokeStyle = "rgba(255, 183, 77, 0.95)";
        strokeSelectedRailWallEdge(ctx, grid, edge, lineScale);
    }
    ctx.restore();
}
