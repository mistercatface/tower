import { resolveSurfaceProfile } from "../Procedural/SurfaceProfileProvider.js";
import { minCornerAabb } from "../Math/Aabb2D.js";
import { gameWorldSurfaceSettings } from "../../Render/WorldSurfaceBootstrap.js";
import { bakeFrameRange } from "./AnimationFrameBake.js";
import { resolveAnimationBakeFrameCounts } from "./bake/SurfaceBakeHelpers.js";
import { TileWorkerCoordinator } from "./TileWorkerCoordinator.js";
/** @typedef {import("../Math/Aabb2D.js").Aabb2D} Aabb2D */
/**
 * @typedef {{ bounds: Aabb2D, zLevel: number, frames: ImageBitmap[] }} AnimatedSurfacePatchBake
 * @typedef {{
 *   profileId: string,
 *   animated: boolean,
 *   sourceFrameCount: number,
 *   bakeFrameCount: number,
 *   play: AnimatedSurfacePatchBake,
 *   railBands: AnimatedSurfacePatchBake[],
 * }} AnimatedSurfaceFlipbook
 */
/** @param {Aabb2D} rect */
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
/** @param {AnimatedSurfaceFlipbook | null | undefined} flipbook */
export function releaseAnimatedSurfaceFlipbook(flipbook) {
    if (!flipbook) return;
    closeBitmapFrames(flipbook.play.frames);
    for (let i = 0; i < flipbook.railBands.length; i++) closeBitmapFrames(flipbook.railBands[i].frames);
}
/**
 * Rail-band rects between an outer bounds AABB and an inset playfield AABB.
 * @param {{ bounds: Aabb2D, play: Aabb2D }} layout
 * @returns {Aabb2D[]}
 */
export function railBandBoundsAroundPlayfield({ bounds, play }) {
    /** @type {Aabb2D[]} */
    const bands = [];
    if (play.minY > bounds.minY) bands.push(minCornerAabb(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, play.minY - bounds.minY));
    if (play.maxY < bounds.maxY) bands.push(minCornerAabb(bounds.minX, play.maxY, bounds.maxX - bounds.minX, bounds.maxY - play.maxY));
    if (play.minX > bounds.minX) bands.push(minCornerAabb(bounds.minX, play.minY, play.minX - bounds.minX, play.maxY - play.minY));
    if (play.maxX < bounds.maxX) bands.push(minCornerAabb(play.maxX, play.minY, bounds.maxX - play.maxX, play.maxY - play.minY));
    return bands;
}
/**
 * @param {Aabb2D} bounds
 * @param {number} zLevel
 * @param {string} profileId
 * @param {number} seed
 * @param {number} frameCount
 * @param {number} bakeFrameCount
 * @param {number} sourceFrameCount
 */
async function bakePatch(bounds, zLevel, profileId, seed, frameCount, bakeFrameCount, sourceFrameCount) {
    const { width, height } = rectWorldSize(bounds);
    const payload = {
        originX: bounds.minX,
        originY: bounds.minY,
        worldWidth: width,
        worldHeight: height,
        zLevel,
        profileId,
        seed,
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
 * Eagerly bake all animation frames for a world-aligned surface (playfield + optional rail bands).
 *
 * @param {{
 *   play: Aabb2D,
 *   bounds: Aabb2D,
 *   railHeight?: number,
 *   profileId: string,
 *   surfaceAnimation?: boolean,
 *   seed: number,
 * }} spec
 */
export async function bakeAnimatedSurfaceFlipbook({ play, bounds, railHeight = 0, profileId, surfaceAnimation = false, seed }) {
    const settings = gameWorldSurfaceSettings;
    const profile = resolveSurfaceProfile(profileId);
    const { sourceTotal, bakeTotal } = resolveAnimationBakeFrameCounts(profile, settings);
    const animated = Boolean(surfaceAnimation && profile?.animation);
    const frameCount = animated ? bakeTotal : 1;
    const railBands = railHeight > 0 ? railBandBoundsAroundPlayfield({ bounds, play }) : [];
    const [playPatch, ...railResults] = await Promise.all([
        bakePatch(play, 0, profileId, seed, frameCount, bakeTotal, sourceTotal),
        ...railBands.map((band) => bakePatch(band, railHeight, profileId, seed, frameCount, bakeTotal, sourceTotal)),
    ]);
    return /** @type {AnimatedSurfaceFlipbook} */ ({ profileId, animated, sourceFrameCount: sourceTotal, bakeFrameCount: frameCount, play: playPatch, railBands: railResults });
}
