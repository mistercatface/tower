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

export function chunkToWorldOrigin(chunkCol, chunkRow, gridMinX, gridMinY, chunkSizePx) {
    return { x: gridMinX + chunkCol * chunkSizePx, y: gridMinY + chunkRow * chunkSizePx };
}

export function gridBoundsToChunkRange(startCol, endCol, startRow, endRow, cellsPerChunk) {
    return {
        minChunkCol: Math.floor(startCol / cellsPerChunk),
        maxChunkCol: Math.floor(endCol / cellsPerChunk),
        minChunkRow: Math.floor(startRow / cellsPerChunk),
        maxChunkRow: Math.floor(endRow / cellsPerChunk),
    };
}

export function worldBoundsToChunkRange(minX, minY, maxX, maxY, gridMinX, gridMinY, chunkSizePx) {
    return {
        minChunkCol: worldToChunkCol(minX, gridMinX, chunkSizePx),
        maxChunkCol: worldToChunkCol(maxX - 1, gridMinX, chunkSizePx),
        minChunkRow: worldToChunkRow(minY, gridMinY, chunkSizePx),
        maxChunkRow: worldToChunkRow(maxY - 1, gridMinY, chunkSizePx),
    };
}

export function chunkKey(chunkCol, chunkRow) {
    return `${chunkCol},${chunkRow}`;
}
