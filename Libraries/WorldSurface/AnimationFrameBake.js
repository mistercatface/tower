/**
 * ANIMATION BAKE PIPELINE
 * 
 * 1. Authored timeline != Baked flipbook:
 *    The timeline (stages/tracks) is resolved to a specific moment during bake.
 * 
 * 2. Progressive Fill (Floor/Wall):
 *    - Frame 0 is baked immediately on the STATIC worker tier.
 *    - Subsequent frames are batched and baked on the ANIMATION worker tier.
 * 
 * 3. Draw Time:
 *    - The draw loop picks the target frame index based on `gameTime`.
 *    - If the target frame hasn't baked yet, it clamps to the nearest available baked frame.
 */

/** Frames baked per incremental animation request (after frame 0). */
export const ANIMATION_FRAME_BATCH_SIZE = 8;

/** Explicit frame ranges for bake requests (always pass one of these at call sites). */
export const bakeFrameRange = {
    first() {
        return { frameStart: 0, frameCount: 1 };
    },
    all(totalFrames) {
        return { frameStart: 0, frameCount: totalFrames };
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
    return Math.min(
        sourceTotal - 1,
        Math.round(bakeIndex * (sourceTotal - 1) / (bakeTotal - 1)),
    );
}

/** Pick the nearest baked slot for a timeline frame resolved from gameTime. */
export function bakeSlotForSourceFrame(sourceIndex, bakeTotal, sourceTotal) {
    if (bakeTotal <= 1 || sourceTotal <= 1) return 0;
    if (bakeTotal >= sourceTotal) return Math.min(bakeTotal - 1, sourceIndex);
    return Math.min(
        bakeTotal - 1,
        Math.round(sourceIndex * (bakeTotal - 1) / (sourceTotal - 1)),
    );
}

export function nextAnimationBatchRange(currentLength, totalFrames, batchSize = ANIMATION_FRAME_BATCH_SIZE) {
    if (currentLength >= totalFrames) return null;
    const frameStart = currentLength;
    const frameCount = Math.min(batchSize, totalFrames - frameStart);
    return { frameStart, frameCount };
}

export function clampBakeFrameRange(range, totalFrames) {
    if (range?.frameStart == null || range?.frameCount == null) {
        throw new Error("Bake frame range requires frameStart and frameCount");
    }
    const { frameStart, frameCount } = range;
    if (!Number.isFinite(frameStart) || !Number.isFinite(frameCount)) {
        throw new Error("Bake frame range requires numeric frameStart and frameCount");
    }
    if (frameStart < 0 || frameCount < 1) {
        throw new Error("Invalid bake frame range");
    }
    if (frameStart >= totalFrames) {
        throw new Error(`frameStart ${frameStart} is outside animation length ${totalFrames}`);
    }
    if (frameStart + frameCount > totalFrames) {
        throw new Error(`frame range ${frameStart}+${frameCount} exceeds animation length ${totalFrames}`);
    }
    return { frameStart, frameCount };
}

export function frameRangeDedupeSuffix({ frameStart, frameCount }) {
    return `:f${frameStart}-${frameStart + frameCount}`;
}

export function isFirstFrameRange({ frameStart, frameCount }) {
    return frameStart === 0 && frameCount === 1;
}
