import { overlayGridCellHighlight, overlayCachedSelectionRing } from "../../Render/overlays/overlayCommands.js";
const FSM_MODE_RING = { explore: "rgba(120, 220, 255, 0.85)", seek_food: "rgba(255, 220, 80, 0.9)", flee: "rgba(255, 80, 120, 0.9)" };
export function formatSnakeFsmDebug(snapshot) {
    const dest = snapshot.destCell ? `${snapshot.destCell.col},${snapshot.destCell.row}` : "—";
    const replan = snapshot.replanReason;
    const speed = Math.hypot(snapshot.vx, snapshot.vy).toFixed(1);
    return `${snapshot.mode} | ${dest} | plen=${snapshot.pathLen} | ${replan} | v=${speed} | ${snapshot.lastTransition}`;
}
export function appendSnakeFsmDebugOverlayCommands(out, state, seeker, snapshot) {
    const grid = state.obstacleGrid;
    const ringColor = FSM_MODE_RING[snapshot.mode];
    out.push(overlayCachedSelectionRing(seeker.x, seeker.y, seeker.radius + 3, { stroke: ringColor, lineWidth: 2 }));
    const dest = snapshot.destCell;
    if (dest) {
        const bounds = grid.getCellBounds(dest.col, dest.row);
        out.push(overlayGridCellHighlight(bounds, grid.cellSize, snapshot.mode, { fill: "rgba(255, 255, 255, 0.06)", stroke: ringColor, lineWidth: 2, dash: [6, 4] }));
    }
}
