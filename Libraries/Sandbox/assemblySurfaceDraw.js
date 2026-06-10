import { isGroundZoneInView } from "../Spatial/zones/groundZones.js";
import { getAssemblyRailBandBounds } from "./assemblyLayout.js";
/** @param {{ play: object, bounds: object, railHeight: number, profileId: string, id: string }} spec */
export function createAssemblySurfaceZone({ play, bounds, railHeight, profileId, id }) {
    return { id, kind: "assemblySurface", profileId, play, bounds, railHeight, aabb: bounds };
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} worldSurfaces
 * @param {object} state
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} playBounds
 * @param {string} profileId
 * @param {{ zLevel?: number, flatHorizontal?: boolean }} [options]
 */
function drawProfileChunkPatch(ctx, worldSurfaces, state, viewport, playBounds, profileId, { zLevel = 0, flatHorizontal = false } = {}) {
    worldSurfaces.drawGroundChunks(ctx, {
        obstacleGrid: state.obstacleGrid,
        viewport,
        state,
        gameTime: state.gameTime ?? 0,
        zLevel,
        playBounds,
        requireWallSegments: flatHorizontal ? false : undefined,
        skipRoofFootprintClip: flatHorizontal || undefined,
    });
}
/** @param {CanvasRenderingContext2D} ctx @param {ReturnType<typeof createAssemblySurfaceZone>} zone @param {object} state @param {import("../Viewport/Viewport.js").Viewport} viewport */
export function drawAssemblySurfaceZone(ctx, zone, state, viewport) {
    if (!zone?.profileId || !state?.worldSurfaces || !viewport) return;
    if (!isGroundZoneInView(zone, viewport)) return;
    const worldSurfaces = state.worldSurfaces;
    const prevOverride = worldSurfaces.surfaceProfileOverride;
    const prevForce = worldSurfaces.forceChunkAnimation;
    worldSurfaces.surfaceProfileOverride = zone.profileId;
    worldSurfaces.forceChunkAnimation = true;
    try {
        drawProfileChunkPatch(ctx, worldSurfaces, state, viewport, zone.play, zone.profileId, { zLevel: 0 });
        const railHeight = zone.railHeight;
        if (railHeight > 0) {
            const bands = getAssemblyRailBandBounds({ bounds: zone.bounds, play: zone.play });
            for (let i = 0; i < bands.length; i++) drawProfileChunkPatch(ctx, worldSurfaces, state, viewport, bands[i], zone.profileId, { zLevel: railHeight, flatHorizontal: true });
        }
    } finally {
        worldSurfaces.surfaceProfileOverride = prevOverride;
        worldSurfaces.forceChunkAnimation = prevForce;
    }
}
/** @param {CanvasRenderingContext2D} ctx @param {object} state @param {import("../Viewport/Viewport.js").Viewport} viewport */
export function drawSandboxAssemblySurfaces(ctx, state, viewport) {
    const zones = state.sandboxSurfaceProfileZones;
    if (!zones?.length) return;
    ctx.save();
    for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        if (zone.kind === "assemblySurface") drawAssemblySurfaceZone(ctx, zone, state, viewport);
    }
    ctx.restore();
}
