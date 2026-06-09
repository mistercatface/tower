import { drawWallSegmentRoofCap } from "../Render/Structure3D/drawWallRoofCap.js";
import { intersectWorldBounds } from "../WorldGen/playBounds.js";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   wallSpatialIndex: import("../Spatial/indexes/WallSpatialIndex.js").WallSpatialIndex | null | undefined,
 *   viewport: import("../Viewport/Viewport.js").Viewport,
 *   canvasWidth: number,
 *   canvasHeight: number,
 *   zLevel: number,
 *   playBounds?: { minX: number, minY: number, maxX: number, maxY: number } | null,
 *   surfaceBake: import("../Render/WorldSceneTypes.js").SurfaceBakeContext,
 *   worldSurfaces: import("./WorldSurfaceEngine.js").WorldSurfaceEngine,
 *   settings: import("./WorldSurfaceSettings.js").WorldSurfaceSettings,
 * }} options
 */
export function drawWallRoofCaps(ctx, options) {
    const { wallSpatialIndex, viewport, canvasWidth, canvasHeight, zLevel, playBounds = null, surfaceBake, worldSurfaces, settings } = options;
    if (!wallSpatialIndex || !viewport || !worldSurfaces || !surfaceBake) return;

    const viewerX = viewport.x;
    const viewerY = viewport.y;
    const viewportBounds = viewport.getWorldBounds(canvasWidth, canvasHeight, settings.viewPaddingPx);
    const bounds = intersectWorldBounds(viewportBounds, playBounds);
    if (!bounds) return;

    const segments = wallSpatialIndex.collectInBounds(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
    ctx.save();
    if (playBounds) {
        ctx.beginPath();
        ctx.rect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
        ctx.clip();
    }
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (segment.isDead) continue;
        drawWallSegmentRoofCap(ctx, segment, { viewerX, viewerY, settings, surfaceBake, worldSurfaces, zLevel });
    }
    ctx.restore();
}
