import { getSurfaceProfileProvider } from "../Procedural/SurfaceProfileProvider.js";
import { animationFrameIndex } from "./ProfileBakeResolver.js";
import { bakeSlotForSourceFrame } from "./AnimationFrameBake.js";
import { drawBakedTexture, drawProjectedHorizontalChunk, isDrawableBakedSurface } from "./WorldSurfaceResolution.js";
import { elevationCameraFromViewport } from "../Spatial/iso/ElevationCamera.js";
import { projectWorldAabbCornersInto } from "../Spatial/iso/IsometricProjection.js";
import { releaseAnimatedSurfaceFlipbook } from "./animatedSurfaceFlipbook.js";
const sPatchCorners = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
];
/**
 * @param {{
 *   id: string,
 *   play: import("../Math/Aabb2D.js").Aabb2D,
 *   bounds: import("../Math/Aabb2D.js").Aabb2D,
 *   railHeight?: number,
 *   profileId: string,
 *   surfaceAnimation?: boolean,
 * }} spec
 */
export function createAnimatedSurfaceZone({ play, bounds, railHeight = 0, profileId, id, surfaceAnimation = false }) {
    return { id, kind: "animatedSurface", profileId, surfaceAnimation, play, bounds, railHeight, aabb: bounds, flipbook: null, bakeGeneration: 0 };
}
/** @param {ReturnType<typeof createAnimatedSurfaceZone>} zone */
export function disposeAnimatedSurfaceZone(zone) {
    zone.bakeGeneration++;
    releaseAnimatedSurfaceFlipbook(zone.flipbook);
    zone.flipbook = null;
}
/** @param {import("./animatedSurfaceFlipbook.js").AnimatedSurfaceFlipbook} flipbook @param {number} gameTime */
function resolveFlipbookFrameIndex(flipbook, gameTime) {
    if (!flipbook.animated || flipbook.play.frames.length <= 1) return 0;
    const profile = getSurfaceProfileProvider().getProfile(flipbook.profileId);
    const sourceFrame = animationFrameIndex(profile.animation, { gameTime });
    return bakeSlotForSourceFrame(sourceFrame, flipbook.bakeFrameCount, flipbook.sourceFrameCount);
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./animatedSurfaceFlipbook.js").AnimatedSurfacePatchBake} patch
 * @param {number} frameIndex
 * @param {number} zLevel
 * @param {import("../Spatial/iso/ElevationCamera.js").ElevationCamera} camera
 */
function drawAnimatedPatch(ctx, patch, frameIndex, zLevel, camera) {
    const canvas = patch.frames[Math.min(patch.frames.length - 1, Math.max(0, frameIndex))];
    if (!isDrawableBakedSurface(canvas)) return;
    const { minX, minY, maxX, maxY } = patch.bounds;
    const worldW = maxX - minX;
    const worldH = maxY - minY;
    if (zLevel <= 0) {
        drawBakedTexture(ctx, canvas, minX, minY, worldW, worldH);
        return;
    }
    const corners = projectWorldAabbCornersInto(sPatchCorners, minX, minY, maxX, maxY, zLevel, camera);
    drawProjectedHorizontalChunk(ctx, canvas, corners);
}
/** @param {CanvasRenderingContext2D} ctx @param {ReturnType<typeof createAnimatedSurfaceZone>} zone @param {object} state @param {import("../Viewport/Viewport.js").Viewport} viewport */
export function drawAnimatedSurfaceZone(ctx, zone, state, viewport) {
    if (!zone?.profileId || !zone.flipbook || !viewport) return;
    if (!viewport.aabbInBounds(zone.aabb, "clip")) return;
    const frameIndex = resolveFlipbookFrameIndex(zone.flipbook, state.gameTime ?? 0);
    const camera = elevationCameraFromViewport(viewport);
    drawAnimatedPatch(ctx, zone.flipbook.play, frameIndex, 0, camera);
    const railBands = zone.flipbook.railBands;
    for (let i = 0; i < railBands.length; i++) drawAnimatedPatch(ctx, railBands[i], frameIndex, zone.railHeight, camera);
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof createAnimatedSurfaceZone>[] | null | undefined} zones
 * @param {object} state
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 */
export function drawAnimatedSurfaceZones(ctx, zones, state, viewport) {
    if (!zones?.length) return;
    ctx.save();
    for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        if (zone.kind === "animatedSurface") drawAnimatedSurfaceZone(ctx, zone, state, viewport);
    }
    ctx.restore();
}
