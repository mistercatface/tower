import { getPropAsset } from "../Props/PropCatalog.js";
import { centeredAabbInto, createAabb } from "../Math/Aabb2D.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { canStampFloorBeltAt, canStampPassagePowerSourceAt } from "./floorOccupancy.js";
import { ensureObstacleGridAtWorld, hitTestRailWallEdgeAtWorld, appendGridEdgeOverlayCommand } from "./gridWallEdit.js";
import { isGridFloorBeltSpawnAsset, isGridPassagePowerSourceSpawnAsset, isRoomNodeSpawnAsset, isPuzzleTemplateSpawnAsset } from "./sandboxCapabilities.js";
import { resolveRoomNodePlacePreview } from "../RoomGraph/index.js";
import { resolveBeltCratePuzzlePlacePreview } from "../RoomGraph/puzzleTemplateBeltCrate.js";
import { overlayAabb } from "../Render/overlays/overlayCommands.js";
const PREVIEW_CELL_BOUNDS = createAabb();
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
    return null;
}
function cellPreviewStyle(tint, valid) {
    if (tint === "voxel") return { stroke: valid ? "rgba(255, 183, 77, 0.9)" : "rgba(255, 96, 96, 0.85)", fill: valid ? "rgba(255, 183, 77, 0.14)" : "rgba(255, 96, 96, 0.1)" };
    if (tint === "power") return { stroke: valid ? "rgba(255, 213, 79, 0.9)" : "rgba(255, 96, 96, 0.85)", fill: valid ? "rgba(255, 213, 79, 0.14)" : "rgba(255, 96, 96, 0.1)" };
    return { stroke: valid ? "rgba(100, 255, 160, 0.9)" : "rgba(255, 96, 96, 0.85)", fill: valid ? "rgba(100, 255, 160, 0.12)" : "rgba(255, 96, 96, 0.1)" };
}
export function appendPlacePreviewOverlayCommands(out, preview, grid) {
    if (!preview) return;
    if (preview.kind === "cell") {
        const { x, y } = grid.gridToWorld(preview.col, preview.row);
        const tint = preview.tint ?? "floor";
        const valid = preview.valid !== false;
        const { fill, stroke } = cellPreviewStyle(tint, valid);
        out.push(overlayAabb(centeredAabbInto(PREVIEW_CELL_BOUNDS, x, y, grid.cellSize, grid.cellSize), { fill, stroke, lineWidth: 1, dash: [4, 3] }));
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
            out.push(overlayAabb(centeredAabbInto(PREVIEW_CELL_BOUNDS, x, y, grid.cellSize, grid.cellSize), { fill, stroke, lineWidth: 1, dash: [4, 3] }));
        }
        return;
    }
    const edge = { col: preview.col, row: preview.row, side: preview.side };
    if (preview.edgeKind === "forcefield") appendGridEdgeOverlayCommand(out, grid, edge, { stroke: "rgba(192, 132, 252, 0.95)", lineWidth: 4, dash: [6, 4] });
    else appendGridEdgeOverlayCommand(out, grid, edge, { stroke: "rgba(255, 183, 77, 0.95)", lineWidth: 3 });
}
