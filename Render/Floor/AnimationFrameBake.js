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
