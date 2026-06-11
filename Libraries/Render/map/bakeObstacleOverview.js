/** @typedef {{ canvas: OffscreenCanvas, minX: number, minY: number, maxX: number, maxY: number }} ObstacleOverviewCache */

/**
 * @param {{ cols: number, rows: number, grid: ArrayLike<number>, minX: number, minY: number, maxX: number, maxY: number }} obstacleGrid
 * @returns {ObstacleOverviewCache | null}
 */
export function bakeObstacleOverviewCache(obstacleGrid) {
    if (!obstacleGrid.cols || !obstacleGrid.rows) return null;
    const canvas = new OffscreenCanvas(obstacleGrid.cols, obstacleGrid.rows);
    const ctx = canvas.getContext("2d");
    const data = ctx.createImageData(obstacleGrid.cols, obstacleGrid.rows);
    const pixels = data.data;
    for (let i = 0; i < obstacleGrid.grid.length; i++) {
        const blocked = obstacleGrid.grid[i] === 1;
        const offset = i * 4;
        if (blocked) {
            pixels[offset] = 72;
            pixels[offset + 1] = 78;
            pixels[offset + 2] = 88;
            pixels[offset + 3] = 255;
        } else {
            pixels[offset] = 12;
            pixels[offset + 1] = 14;
            pixels[offset + 2] = 18;
            pixels[offset + 3] = 255;
        }
    }
    ctx.putImageData(data, 0, 0);
    return { canvas, minX: obstacleGrid.minX, minY: obstacleGrid.minY, maxX: obstacleGrid.maxX, maxY: obstacleGrid.maxY };
}
