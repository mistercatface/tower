import { centeredAabbInto, createAabb } from "../Math/Aabb2D.js";
import { cellBoundsAtOriginInto } from "../Spatial/grid/GridCoords.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { forcefieldEdgeAt } from "../Spatial/grid/gridCellTopology.js";
import { appendGridEdgeOverlayCommand } from "./gridWallEdit.js";
import { overlayAabb, overlayCachedSelectionRing, overlayGridCellHighlight } from "../Render/overlays/overlayCommands.js";
const FLOOR_BELT_SELECTION_BOUNDS = createAabb();
const WALL_CELL_SELECTION_BOUNDS = createAabb();
const PROP_TILE_CELL_BOUNDS = createAabb();
const PROP_SELECTION_STROKE = "rgba(255, 252, 245, 0.32)";
const PROP_SELECTION_DASH = [4, 4];
const SELECTION_RING_PAD = 4;
function selectionRingRadius(prop) {
    const base = prop.getBoundingRadius?.() ?? prop.radius ?? 8;
    return base + SELECTION_RING_PAD;
}
export function appendSelectionOverlayCommands(out, { selectedProps, showRings, selectedFloorCell = null, selectedVoxelCell = null, selectedRailEdge = null, grid = null }) {
    if (!showRings) return;
    for (let i = 0; i < selectedProps.length; i++) {
        const prop = selectedProps[i];
        out.push(overlayCachedSelectionRing(prop.x, prop.y, selectionRingRadius(prop), { stroke: PROP_SELECTION_STROKE, lineWidth: 1, dash: PROP_SELECTION_DASH }));
    }
    if (selectedFloorCell && grid) {
        const { x, y } = grid.gridToWorld(selectedFloorCell.col, selectedFloorCell.row);
        out.push(
            overlayGridCellHighlight(centeredAabbInto(FLOOR_BELT_SELECTION_BOUNDS, x, y, grid.cellSize, grid.cellSize), grid.cellSize, "floor", {
                fill: "rgba(120, 200, 255, 0.1)",
                stroke: "rgba(120, 200, 255, 0.75)",
                lineWidth: 1,
                dash: [4, 3],
            }),
        );
    }
    if (selectedVoxelCell && grid) {
        const { x, y } = grid.gridToWorld(selectedVoxelCell.col, selectedVoxelCell.row);
        out.push(
            overlayGridCellHighlight(centeredAabbInto(WALL_CELL_SELECTION_BOUNDS, x, y, grid.cellSize, grid.cellSize), grid.cellSize, "voxel", {
                fill: "rgba(255, 152, 0, 0.12)",
                stroke: "rgba(255, 152, 0, 0.85)",
                lineWidth: 1,
                dash: [4, 3],
            }),
        );
    }
    if (selectedRailEdge && grid)
        if (forcefieldEdgeAt(grid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side))
            appendGridEdgeOverlayCommand(out, grid, selectedRailEdge, { stroke: "rgba(192, 132, 252, 0.95)", lineWidth: 4, dash: [6, 4] });
        else appendGridEdgeOverlayCommand(out, grid, selectedRailEdge, { stroke: "rgba(255, 152, 0, 0.9)", lineWidth: 3 });
}
export function appendMarqueeOverlayCommands(out, { marqueeRect }) {
    if (!marqueeRect) return;
    out.push(overlayAabb(marqueeRect, { fill: "rgba(255, 252, 245, 0.05)", stroke: "rgba(255, 252, 245, 0.32)", lineWidth: 1, dash: [4, 4] }));
}
export function appendPropTileCellOverlayCommands(out, { show, grid, worldProps }) {
    if (!show) return;
    for (let i = 0; i < worldProps.length; i++) {
        const prop = worldProps[i];
        if (prop.isDead) continue;
        const { col, row } = grid.worldToGrid(prop.x, prop.y);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        cellBoundsAtOriginInto(PROP_TILE_CELL_BOUNDS, grid.minX, grid.minY, col, row, grid.cellSize);
        out.push(overlayGridCellHighlight(PROP_TILE_CELL_BOUNDS, grid.cellSize, "propTile", { fill: "rgba(160, 255, 120, 0.1)", stroke: "rgba(160, 255, 120, 0.5)", lineWidth: 1 }));
    }
}
