import { drawImageQuad } from "../../Canvas/AffineTexture.js";
import { getSegmentFootprintCorners } from "../../Spatial/geometry/WallGeometry.js";
import { resolveElevationAlpha } from "../../Spatial/iso/IsometricProjection.js";
import { getTexelResolution, shouldSmoothTextureDownsample } from "../../WorldSurface/WorldSurfaceResolution.js";
import { getWallDamageAlpha, getWallDamageColor, wallDamageOverlayStyle } from "./wallDamageVisual.js";

/**
 * @param {import("../WorldSceneTypes.js").SurfaceBakeContext} surfaceBake
 * @param {number} wallCx
 * @param {number} wallCy
 * @param {object | null} cacheObj
 */
function resolveWallProfileId(surfaceBake, wallCx, wallCy, cacheObj) {
    let profileId = cacheObj ? cacheObj._cachedProfileId : null;
    if (!profileId || surfaceBake.surfaceProfileOverride) {
        profileId = surfaceBake.resolveProfileAt(wallCx, wallCy);
        if (cacheObj && !surfaceBake.surfaceProfileOverride) cacheObj._cachedProfileId = profileId;
    }
    return profileId;
}

/**
 * @param {object} segment
 * @param {number} zLevel
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {number} cameraHeight
 * @param {number} defaultWallHeight
 */
function projectSegmentRoofCorners(segment, zLevel, viewerX, viewerY, cameraHeight, defaultWallHeight) {
    const wallHeight = segment.wallHeight ?? defaultWallHeight;
    const alpha = resolveElevationAlpha(zLevel, cameraHeight, 1);
    const footprint = getSegmentFootprintCorners(segment);
    const projected = [];
    for (let i = 0; i < footprint.length; i++) {
        const corner = footprint[i];
        projected.push({
            x: corner.x + (corner.x - viewerX) * alpha,
            y: corner.y + (corner.y - viewerY) * alpha,
        });
    }
    return { projected, wallHeight, footprint };
}

/**
 * Draw one wall roof cap from the wall-face atlas top strip (same texels as the wall cap).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} segment
 * @param {{
 *   viewerX: number,
 *   viewerY: number,
 *   settings: import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings,
 *   surfaceBake: import("../WorldSceneTypes.js").SurfaceBakeContext,
 *   worldSurfaces: import("../../WorldSurface/WorldSurfaceEngine.js").WorldSurfaceEngine,
 *   zLevel: number,
 * }} options
 */
export function drawWallSegmentRoofCap(ctx, segment, { viewerX, viewerY, settings, surfaceBake, worldSurfaces, zLevel }) {
    const { projected, wallHeight, footprint } = projectSegmentRoofCorners(segment, zLevel, viewerX, viewerY, settings.cameraHeight, settings.wallHeight);
    if (Math.abs(wallHeight - zLevel) > 0.01) return;

    const p1 = footprint[0];
    const p2 = footprint[1];
    const edgeCache = { cx: (p1.x + p2.x) * 0.5, cy: (p1.y + p2.y) * 0.5 };
    const profileId = resolveWallProfileId(surfaceBake, segment.x, segment.y, edgeCache);
    const ppwu = getTexelResolution(settings);
    const cellSize = settings.cellSize;
    const H_px = wallHeight * ppwu;
    const W_px = cellSize * ppwu;
    const wallColor = getWallDamageColor(segment);
    const damageAlpha = getWallDamageAlpha(segment);

    const atlas = worldSurfaces.getOrEnsureWallAtlas(p1, p2, { profileId, surfaceBake, wallHeight, cacheObj: edgeCache });
    const flatCanvas = atlas ? worldSurfaces.resolveWallAtlasCanvas(atlas.canvases, profileId, surfaceBake.gameTime) : null;
    const hasTexture = flatCanvas && !flatCanvas.isPlaceholder;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i].x, projected[i].y);
    ctx.closePath();
    ctx.clip();

    if (hasTexture) {
        ctx.imageSmoothingEnabled = shouldSmoothTextureDownsample(settings);
        drawImageQuad(
            ctx,
            flatCanvas,
            0,
            H_px,
            flatCanvas.width,
            H_px + W_px,
            projected[0],
            projected[1],
            projected[2],
            projected[3],
            { bleedPx: settings.wallTextureBleedPx ?? 1 },
        );
    } else {
        ctx.fillStyle = wallColor;
        ctx.fill();
    }

    if (damageAlpha > 0) {
        ctx.fillStyle = wallDamageOverlayStyle(damageAlpha);
        ctx.fill();
    }
    ctx.restore();
}
