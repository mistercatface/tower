import { overlayGridCellHighlight } from "../../Render/overlays/overlayCommands.js";
export function appendGridCellVisionOverlayCommands(out, { grid, cells, cellFill = "rgba(120, 220, 255, 0.16)", cellStroke = "rgba(120, 220, 255, 0.55)", lineWidth = 1 }) {
    if (!grid || !cells?.length) return;
    for (let i = 0; i < cells.length; i++) {
        const { col, row } = cells[i];
        const bounds = grid.getCellBounds(col, row);
        out.push(overlayGridCellHighlight(bounds, grid.cellSize, "snakeVision", { fill: cellFill, stroke: cellStroke, lineWidth }));
    }
}
