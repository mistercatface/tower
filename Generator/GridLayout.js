/** Snap a tile layout so its origin sits on the global nav cell grid (multiples of cellSize). */
export function snapLayoutOrigin(px, py, cols, rows, cellSize) {
    const totalW = cols * cellSize;
    const totalH = rows * cellSize;
    return { offsetX: Math.round((px - totalW / 2) / cellSize) * cellSize, offsetY: Math.round((py - totalH / 2) / cellSize) * cellSize };
}
export function gridCellCenter(offsetX, offsetY, col, row, cellSize) {
    return { x: offsetX + col * cellSize + cellSize / 2, y: offsetY + row * cellSize + cellSize / 2 };
}
