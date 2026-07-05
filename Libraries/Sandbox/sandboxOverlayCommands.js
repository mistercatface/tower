import { centeredAabbInto, createAabb } from "../Math/math.js";
import {  cellBoundsAtOriginInto  } from "../Spatial/spatial.js";
import {  cellInRect  } from "../Spatial/spatial.js";
import { appendGridEdgeOverlayCommand } from "../Spatial/spatial.js";
import { overlayAabb, overlayCachedSelectionRing, overlayGridCellHighlight } from "../Render/overlays/overlayCommands.js";
const FLOOR_BELT_SELECTION_BOUNDS = createAabb();
const WALL_CELL_SELECTION_BOUNDS = createAabb();
const PROP_TILE_CELL_BOUNDS = createAabb();
const PROP_SELECTION_STROKE = "rgba(255, 252, 245, 0.32)";
const PROP_SELECTION_DASH = [4, 4];
const SELECTION_RING_PAD = 4;
function selectionRingRadius(prop) {
    const base = prop.radius ?? 8;
    return base + SELECTION_RING_PAD;
}
export function appendSelectionOverlayCommands(out, { selectedProps, showRings, selectedFloorCell = null, selectedVoxelCell = null, selectedRailEdge = null, grid = null }) {
    if (!showRings) return;
    for (let i = 0; i < selectedProps.length; i++) {
        const prop = selectedProps[i];
        out.push(overlayCachedSelectionRing(prop.x, prop.y, selectionRingRadius(prop), { stroke: PROP_SELECTION_STROKE, lineWidth: 1, dash: PROP_SELECTION_DASH }));
    }
    if (selectedFloorCell && grid) {
        const x = grid.gridCenterX(selectedFloorCell.col);
        const y = grid.gridCenterY(selectedFloorCell.row);
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
        const x = grid.gridCenterX(selectedVoxelCell.col);
        const y = grid.gridCenterY(selectedVoxelCell.row);
        out.push(
            overlayGridCellHighlight(centeredAabbInto(WALL_CELL_SELECTION_BOUNDS, x, y, grid.cellSize, grid.cellSize), grid.cellSize, "voxel", {
                fill: "rgba(255, 152, 0, 0.12)",
                stroke: "rgba(255, 152, 0, 0.85)",
                lineWidth: 1,
                dash: [4, 3],
            }),
        );
    }
    if (selectedRailEdge && grid) appendGridEdgeOverlayCommand(out, grid, selectedRailEdge, { stroke: "rgba(255, 152, 0, 0.9)", lineWidth: 3 });
}
export function appendMarqueeOverlayCommands(out, { marqueeRect }) {
    if (!marqueeRect) return;
    out.push(overlayAabb(marqueeRect, { fill: "rgba(255, 252, 245, 0.05)", stroke: "rgba(255, 252, 245, 0.32)", lineWidth: 1, dash: [4, 4] }));
}
export function queryPropsInView(entityRegistry, viewport, spatialFrame, { tier = "props", hitTest = "circle", match = null, filterId = "overlay" } = {}) {
    return entityRegistry.queryView({ bounds: viewport.bounds(tier), kinds: ["worldProp"], filterId, match, hitTest }, spatialFrame);
}
