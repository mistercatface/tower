import { overlayGridCellHighlight, overlayCachedSelectionRing, overlaySegment } from "../../Render/overlays/overlayCommands.js";
const FSM_MODE_RING = { explore: "rgba(120, 220, 255, 0.85)", seek_food: "rgba(255, 220, 80, 0.9)", seek_prey: "rgba(255, 120, 80, 0.9)", flee: "rgba(255, 80, 120, 0.9)" };
export function appendSnakeFsmDebugOverlayCommands(out, state, seeker, snapshot) {
    const grid = state.obstacleGrid;
    const ringColor = FSM_MODE_RING[snapshot.mode];
    out.push(overlayCachedSelectionRing(seeker.x, seeker.y, seeker.radius + 3, { stroke: ringColor, lineWidth: 2 }));
    const dest = snapshot.destCell;
    if (dest) {
        const bounds = grid.getCellBounds(dest.col, dest.row);
        out.push(overlayGridCellHighlight(bounds, grid.cellSize, snapshot.mode, { fill: "rgba(255, 255, 255, 0.06)", stroke: ringColor, lineWidth: 2, dash: [6, 4] }));
        const destWorld = grid.gridToWorld(dest.col, dest.row);
        out.push(overlaySegment(seeker.x, seeker.y, destWorld.x, destWorld.y, { stroke: ringColor, lineWidth: 2, dash: [8, 6] }));
    }
}
