import { isGroundZoneInView } from "./groundZones.js";

/** @param {number} centerX @param {number} centerY @param {number} halfWidth @param {number} halfHeight @param {string} profileId @param {{ id?: string }} [options] */
export function createSurfaceProfileRectZone(centerX, centerY, halfWidth, halfHeight, profileId, { id = "surface-profile-zone" } = {}) {
    return {
        id,
        kind: "surfaceProfileRect",
        profileId,
        x: centerX,
        y: centerY,
        halfWidth,
        halfHeight,
        aabb: { minX: centerX - halfWidth, minY: centerY - halfHeight, maxX: centerX + halfWidth, maxY: centerY + halfHeight },
    };
}

export { isGroundZoneInView as isSurfaceProfileRectZoneInView };

/**
 * Procedural floor patch — baked ground chunks clipped to the zone rect.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof createSurfaceProfileRectZone>} zone
 * @param {object} state
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 */
export function drawSurfaceProfileRectZone(ctx, zone, state, viewport) {
    if (!zone?.profileId || !state?.worldSurfaces || !viewport) return;
    if (!isGroundZoneInView(zone, viewport)) return;
    const worldSurfaces = state.worldSurfaces;
    const prevOverride = worldSurfaces.surfaceProfileOverride;
    worldSurfaces.surfaceProfileOverride = zone.profileId;
    worldSurfaces.drawGroundChunks(ctx, {
        obstacleGrid: state.obstacleGrid,
        viewport,
        state,
        gameTime: state.gameTime ?? 0,
        zLevel: 0,
        playBounds: zone.aabb,
    });
    worldSurfaces.surfaceProfileOverride = prevOverride;
}

/** @param {CanvasRenderingContext2D} ctx @param {object} state @param {import("../../Viewport/Viewport.js").Viewport} viewport */
export function drawSurfaceProfileRectZones(ctx, state, viewport) {
    const zones = state.sandboxSurfaceProfileZones;
    if (!zones?.length) return;
    ctx.save();
    for (let i = 0; i < zones.length; i++) drawSurfaceProfileRectZone(ctx, zones[i], state, viewport);
    ctx.restore();
}
