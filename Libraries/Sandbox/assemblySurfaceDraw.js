import { isGroundZoneInView } from "../Spatial/zones/groundZones.js";
import { getGameWorldSurfaceSettings } from "../../Render/WorldSurfaceBootstrap.js";
import { getSurfaceProfileProvider } from "../Procedural/SurfaceProfileProvider.js";
import { animationFrameIndex } from "../WorldSurface/ProfileBakeResolver.js";
import { bakeSlotForSourceFrame } from "../WorldSurface/AnimationFrameBake.js";
import { drawBakedTexture } from "../WorldSurface/WorldSurfaceResolution.js";
import { projectWorldPointAtHeight } from "../Spatial/iso/IsometricProjection.js";
import { drawImageQuad } from "../Canvas/AffineTexture.js";
/** @param {{ play: object, bounds: object, railHeight: number, profileId: string, id: string, surfaceAnimation?: boolean }} spec */
export function createAssemblySurfaceZone({ play, bounds, railHeight, profileId, id, surfaceAnimation = false }) {
    return { id, kind: "assemblySurface", profileId, surfaceAnimation, play, bounds, railHeight, aabb: bounds, flipbook: null, bakeGeneration: 0 };
}
/** @param {import("./assemblySurfaceBake.js").AssemblySurfaceFlipbook} flipbook @param {number} gameTime */
function resolveFlipbookFrameIndex(flipbook, gameTime) {
    if (!flipbook.animated || flipbook.play.frames.length <= 1) return 0;
    const profile = getSurfaceProfileProvider().getProfile(flipbook.profileId);
    const sourceFrame = animationFrameIndex(profile.animation, { gameTime });
    return bakeSlotForSourceFrame(sourceFrame, flipbook.bakeFrameCount, flipbook.sourceFrameCount);
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./assemblySurfaceBake.js").AssemblySurfacePatchBake} patch
 * @param {number} frameIndex
 * @param {import("../../Render/WorldSurfaceBootstrap.js").WorldSurfaceSettings} settings
 * @param {number} zLevel
 * @param {number} viewerX
 * @param {number} viewerY
 */
function drawAssemblyPatch(ctx, patch, frameIndex, settings, zLevel, viewerX, viewerY) {
    const canvas = patch.frames[Math.min(patch.frames.length - 1, Math.max(0, frameIndex))];
    if (!canvas) return;
    const { minX, minY, maxX, maxY } = patch.bounds;
    const worldW = maxX - minX;
    const worldH = maxY - minY;
    if (zLevel <= 0) {
        drawBakedTexture(ctx, canvas, minX, minY, worldW, worldH, settings);
        return;
    }
    ctx.save();
    const corners = [
        projectWorldPointAtHeight(minX, minY, viewerX, viewerY, zLevel, settings.cameraHeight),
        projectWorldPointAtHeight(maxX, minY, viewerX, viewerY, zLevel, settings.cameraHeight),
        projectWorldPointAtHeight(maxX, maxY, viewerX, viewerY, zLevel, settings.cameraHeight),
        projectWorldPointAtHeight(minX, maxY, viewerX, viewerY, zLevel, settings.cameraHeight),
    ];
    const bleedPx = settings.wallTextureBleedPx ?? 1;
    ctx.imageSmoothingEnabled = false;
    drawImageQuad(ctx, canvas, 0, 0, canvas.width, canvas.height, corners[0], corners[1], corners[2], corners[3], { bleedPx });
    ctx.restore();
}
/** @param {CanvasRenderingContext2D} ctx @param {ReturnType<typeof createAssemblySurfaceZone>} zone @param {object} state @param {import("../Viewport/Viewport.js").Viewport} viewport */
export function drawAssemblySurfaceZone(ctx, zone, state, viewport) {
    if (!zone?.profileId || !zone.flipbook || !viewport) return;
    if (!isGroundZoneInView(zone, viewport)) return;
    const settings = getGameWorldSurfaceSettings();
    const frameIndex = resolveFlipbookFrameIndex(zone.flipbook, state.gameTime ?? 0);
    const viewerX = viewport.x;
    const viewerY = viewport.y;
    drawAssemblyPatch(ctx, zone.flipbook.play, frameIndex, settings, 0, viewerX, viewerY);
    const railBands = zone.flipbook.railBands;
    for (let i = 0; i < railBands.length; i++) drawAssemblyPatch(ctx, railBands[i], frameIndex, settings, 0, viewerX, viewerY);
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
