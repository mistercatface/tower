export function worldIdxAtCell(grid, col, row) {
    return grid.worldToIdx(grid.gridCenterX(col), grid.gridCenterY(row));
}
