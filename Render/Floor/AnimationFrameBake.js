/** Frames baked per incremental animation request (after frame 0). */
export const ANIMATION_FRAME_BATCH_SIZE = 8;

export function nextAnimationBatchRange(currentLength, totalFrames, batchSize = ANIMATION_FRAME_BATCH_SIZE) {
    if (currentLength >= totalFrames) return null;
    const frameStart = currentLength;
    const frameCount = Math.min(batchSize, totalFrames - frameStart);
    return { frameStart, frameCount };
}

export function resolveBakeFrameRange(payload, totalFrames) {
    if (payload.firstFrameOnly) {
        return { frameStart: 0, frameCount: 1 };
    }
    if (payload.frameStart != null && payload.frameCount != null) {
        const frameStart = Math.max(0, payload.frameStart);
        const frameCount = Math.min(payload.frameCount, Math.max(0, totalFrames - frameStart));
        return { frameStart, frameCount };
    }
    return { frameStart: 0, frameCount: totalFrames };
}

export function frameRangeDedupeSuffix(payload) {
    if (payload.firstFrameOnly) {
        return ":f0-1";
    }
    if (payload.frameStart != null && payload.frameCount != null) {
        return `:f${payload.frameStart}-${payload.frameStart + payload.frameCount}`;
    }
    return ":fall";
}

export function isFirstFrameBakeRequest(payload) {
    return payload.firstFrameOnly === true
        || (payload.frameStart === 0 && payload.frameCount === 1);
}
