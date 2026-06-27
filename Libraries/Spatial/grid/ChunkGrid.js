/** Fixed-size render chunks aligned to the global nav cell grid. */
export function getChunkSizePx(cellSize, cellsPerChunk) {
    return cellSize * cellsPerChunk;
}
export function worldToChunkCol(worldX, gridMinX, chunkSizePx) {
    return Math.floor((worldX - gridMinX) / chunkSizePx);
}
export function worldToChunkRow(worldY, gridMinY, chunkSizePx) {
    return Math.floor((worldY - gridMinY) / chunkSizePx);
}
export function gridBoundsToChunkRange(startCol, endCol, startRow, endRow, cellsPerChunk) {
    return {
        minChunkCol: Math.floor(startCol / cellsPerChunk),
        maxChunkCol: Math.floor(endCol / cellsPerChunk),
        minChunkRow: Math.floor(startRow / cellsPerChunk),
        maxChunkRow: Math.floor(endRow / cellsPerChunk),
    };
}
export function worldBoundsToChunkRange(bounds, gridMinX, gridMinY, chunkSizePx) {
    return {
        minChunkCol: worldToChunkCol(bounds.minX, gridMinX, chunkSizePx),
        maxChunkCol: worldToChunkCol(bounds.maxX - 1, gridMinX, chunkSizePx),
        minChunkRow: worldToChunkRow(bounds.minY, gridMinY, chunkSizePx),
        maxChunkRow: worldToChunkRow(bounds.maxY - 1, gridMinY, chunkSizePx),
    };
}
export function chunkKey(chunkCol, chunkRow) {
    return `${chunkCol},${chunkRow}`;
}
