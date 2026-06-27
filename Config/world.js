/** World sim layout — cell counts and cell size; convert to px at use sites via `worldSpanPx`. */
export const gridSettings = { cellSize: 16, cols: 150, rows: 150, minCellsPerChunk: 8, maxCellsPerChunk: 64 };
/** @param {number} cells @param {number} [cellSize] */
export function worldSpanPx(cells, cellSize = gridSettings.cellSize) {
    return cells * cellSize;
}
/** @typedef {typeof WORLD_SURFACE_DEFAULTS} WorldSurfaceDefaults */
/** Baseline world-surface render/bake tuning (cell counts where applicable). Px derived in `WorldSurfaceBootstrap`. */
export const WORLD_SURFACE_DEFAULTS = {
    surfaceTilePeriodCells: 32,
    viewPaddingPx: 128,
    viewQueryPadPx: 48,
    maxCachedSurfaces: 10000,
    surfaceBakeScale: 1,
    wallHeightCells: 9,
    maxWallHeightLevel: 9,
    wallTextureBleedPx: 1,
    wallSubdivNearPx: 80,
    wallSubdivFarPx: 320,
    floorShadow: "#12161c",
    bloom: { enabled: false, blur: 2 },
    animationBakeMaxFrames: null,
};
