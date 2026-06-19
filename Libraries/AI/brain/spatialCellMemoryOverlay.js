import { overlayAabb } from "../../Render/overlays/overlayCommands.js";
const DEFAULT_BUCKET_COUNT = 8;
export function memoryHeatmapRecencyBucket(rankFromNewest, capacity, bucketCount = DEFAULT_BUCKET_COUNT) {
    if (bucketCount <= 1 || capacity <= 1) return 0;
    return Math.min(bucketCount - 1, Math.floor((rankFromNewest / (capacity - 1)) * bucketCount));
}
export function memoryHeatmapBucketStyle(bucket, bucketCount, style) {
    const fillRgb = style.fillRgb ?? "180, 100, 255";
    const fillAlphaMax = style.fillAlphaMax ?? 0.12;
    const fillAlphaMin = style.fillAlphaMin ?? 0.02;
    const span = Math.max(1, bucketCount - 1);
    const t = 1 - bucket / span;
    const fillA = fillAlphaMin + t * (fillAlphaMax - fillAlphaMin);
    return { fill: `rgba(${fillRgb}, ${fillA})` };
}
export function appendSpatialCellMemoryOverlayCommands(out, { grid, spatial, style = {}, bucketCount = DEFAULT_BUCKET_COUNT }) {
    if (!grid || !spatial?.size) return;
    const capacity = spatial.capacity;
    spatial.forEachNewestFirst((col, row, _seq, rankFromNewest) => {
        const bucket = memoryHeatmapRecencyBucket(rankFromNewest, capacity, bucketCount);
        const bounds = grid.getCellBounds(col, row);
        const bucketStyle = memoryHeatmapBucketStyle(bucket, bucketCount, style);
        out.push(overlayAabb(bounds, bucketStyle));
    });
}
