import { getGameWorldSurfaceSettings } from "../../Render/WorldSurfaceBootstrap.js";
import { getSurfaceProfileProvider } from "../Procedural/SurfaceProfileProvider.js";
import { getAssemblyRailBandBounds } from "./assemblyLayout.js";
import { bakeFrameRange } from "../WorldSurface/AnimationFrameBake.js";
import { resolveAnimationBakeFrameCounts } from "../WorldSurface/bake/SurfaceBakeHelpers.js";
import { TileWorkerCoordinator } from "../WorldSurface/TileWorkerCoordinator.js";
/**
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} WorldRect
 * @typedef {{ bounds: WorldRect, zLevel: number, frames: ImageBitmap[] }} AssemblySurfacePatchBake
 * @typedef {{
 *   profileId: string,
 *   animated: boolean,
 *   sourceFrameCount: number,
 *   bakeFrameCount: number,
 *   play: AssemblySurfacePatchBake,
 *   railBands: AssemblySurfacePatchBake[],
 * }} AssemblySurfaceFlipbook
 */
/** @param {WorldRect} rect */
function rectWorldSize(rect) {
    return { width: Math.max(1, rect.maxX - rect.minX), height: Math.max(1, rect.maxY - rect.minY) };
}
/** @param {ImageBitmap[]} frames */
function closeBitmapFrames(frames) {
    for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        if (frame instanceof ImageBitmap) frame.close();
    }
}
/** @param {AssemblySurfaceFlipbook | null | undefined} flipbook */
export function releaseAssemblySurfaceFlipbook(flipbook) {
    if (!flipbook) return;
    closeBitmapFrames(flipbook.play.frames);
    for (let i = 0; i < flipbook.railBands.length; i++) closeBitmapFrames(flipbook.railBands[i].frames);
}
/**
 * @param {WorldRect} bounds
 * @param {number} zLevel
 * @param {string} profileId
 * @param {number} seed
 * @param {number} frameCount
 * @param {number} bakeFrameCount
 * @param {number} sourceFrameCount
 * @param {{ cellSize: number, texelResolution: number }} settings
 */
async function bakePatch(bounds, zLevel, profileId, seed, frameCount, bakeFrameCount, sourceFrameCount, settings) {
    const { width, height } = rectWorldSize(bounds);
    const payload = {
        originX: bounds.minX,
        originY: bounds.minY,
        worldWidth: width,
        worldHeight: height,
        zLevel,
        profileId,
        seed,
        cellSize: settings.cellSize,
        texelResolution: settings.texelResolution,
        centerX: (bounds.minX + bounds.maxX) / 2,
        centerY: (bounds.minY + bounds.maxY) / 2,
        animationBakeFrames: bakeFrameCount,
        animationSourceFrames: sourceFrameCount,
        ...bakeFrameRange.batch(0, frameCount),
    };
    const frames = await TileWorkerCoordinator.requestHorizontalPatchBake(payload);
    return { bounds, zLevel, frames };
}
/**
 * Eagerly bake all animation frames for an assembly surface (playfield + rail bands).
 * @param {{ play: WorldRect, bounds: WorldRect, railHeight: number }} layout
 * @param {string} profileId
 * @param {boolean} surfaceAnimation
 * @param {number} seed
 */
export async function eagerBakeAssemblySurfaceFlipbook(layout, profileId, surfaceAnimation, seed) {
    const settings = getGameWorldSurfaceSettings();
    const profile = getSurfaceProfileProvider().getProfile(profileId);
    const { sourceTotal, bakeTotal } = resolveAnimationBakeFrameCounts(profile, settings);
    const animated = Boolean(surfaceAnimation && profile?.animation);
    const frameCount = animated ? bakeTotal : 1;
    const [play, ...railResults] = await Promise.all([
        bakePatch(layout.play, 0, profileId, seed, frameCount, bakeTotal, sourceTotal, settings),
        ...getAssemblyRailBandBounds({ bounds: layout.bounds, play: layout.play }).map((band) => bakePatch(band, layout.railHeight, profileId, seed, frameCount, bakeTotal, sourceTotal, settings)),
    ]);
    return /** @type {AssemblySurfaceFlipbook} */ ({ profileId, animated, sourceFrameCount: sourceTotal, bakeFrameCount: frameCount, play, railBands: railResults });
}
