/**
 * Profile timeline → bake frame index helpers.
 * World render bakes frame 0 only; animated surface zones bake full flipbooks — see animatedSurfaceFlipbook.js.
 */
/** Explicit frame ranges for worker bake requests. */
export const bakeFrameRange = {
    first() {
        return { frameStart: 0, frameCount: 1 };
    },
    batch(frameStart, frameCount) {
        return { frameStart, frameCount };
    },
};
/** Map a baked flipbook slot to the authored profile frame index. */
export function sourceFrameIndexForBakeSlot(bakeIndex, bakeTotal, sourceTotal) {
    if (sourceTotal <= 1) return 0;
    if (bakeTotal <= 1) return 0;
    if (bakeTotal >= sourceTotal) return Math.min(sourceTotal - 1, bakeIndex);
    return Math.min(sourceTotal - 1, Math.round((bakeIndex * (sourceTotal - 1)) / (bakeTotal - 1)));
}
/** Pick the nearest baked slot for a timeline frame resolved from gameTime. */
export function bakeSlotForSourceFrame(sourceIndex, bakeTotal, sourceTotal) {
    if (bakeTotal <= 1 || sourceTotal <= 1) return 0;
    if (bakeTotal >= sourceTotal) return Math.min(bakeTotal - 1, sourceIndex);
    return Math.min(bakeTotal - 1, Math.round((sourceIndex * (bakeTotal - 1)) / (sourceTotal - 1)));
}
export function clampBakeFrameRange(range, totalFrames) {
    if (range?.frameStart == null || range?.frameCount == null) throw new Error("Bake frame range requires frameStart and frameCount");
    const { frameStart, frameCount } = range;
    if (!Number.isFinite(frameStart) || !Number.isFinite(frameCount)) throw new Error("Bake frame range requires numeric frameStart and frameCount");
    if (frameStart < 0 || frameCount < 1) throw new Error("Invalid bake frame range");
    if (frameStart >= totalFrames) throw new Error(`frameStart ${frameStart} is outside animation length ${totalFrames}`);
    if (frameStart + frameCount > totalFrames) throw new Error(`frame range ${frameStart}+${frameCount} exceeds animation length ${totalFrames}`);
    return { frameStart, frameCount };
}
export function isFirstFrameRange({ frameStart, frameCount }) {
    return frameStart === 0 && frameCount === 1;
}
