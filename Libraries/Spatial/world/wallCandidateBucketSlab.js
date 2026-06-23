const MAX_WALL_BUCKETS = 4096;
const BUCKET_MASK = MAX_WALL_BUCKETS - 1;
const EMPTY_STAMP = -1;
export function wallBucketKeyParts(grid, worldX, worldY, queryRadius) {
    const col = grid.worldCol(worldX);
    const row = grid.worldRow(worldY);
    const pad = 1 + Math.ceil(queryRadius / grid.cellSize);
    return { keyLo: (col & 0xffff) | ((row & 0xffff) << 16), keyHi: pad & 0xff };
}
function bucketSlotForKey(keyLo, keyHi) {
    return (keyLo ^ (keyHi * 0x9e3779b9)) & BUCKET_MASK;
}
function acquireBucketSegments(slab, slot) {
    let segments = slab.segments[slot];
    if (segments) {
        segments.length = 0;
        return segments;
    }
    segments = slab.segmentPool.pop();
    if (!segments) segments = [];
    else segments.length = 0;
    slab.segments[slot] = segments;
    return segments;
}
export function createWallCandidateBucketSlab() {
    const frameStamp = new Int32Array(MAX_WALL_BUCKETS);
    frameStamp.fill(EMPTY_STAMP);
    return {
        keyLo: new Int32Array(MAX_WALL_BUCKETS),
        keyHi: new Int32Array(MAX_WALL_BUCKETS),
        frameStamp,
        revisionStamp: new Int32Array(MAX_WALL_BUCKETS),
        segments: new Array(MAX_WALL_BUCKETS),
        segmentPool: [],
    };
}
export function resetWallCandidateBucketSlab(slab) {
    for (let i = 0; i < MAX_WALL_BUCKETS; i++) {
        if (slab.frameStamp[i] === EMPTY_STAMP) continue;
        const segments = slab.segments[i];
        if (segments) {
            segments.length = 0;
            slab.segmentPool.push(segments);
            slab.segments[i] = null;
        }
        slab.frameStamp[i] = EMPTY_STAMP;
    }
}
export function invalidateWallCandidateBucketFrame(slab) {
    slab.frameStamp.fill(EMPTY_STAMP);
}
export function lookupWallCandidateBucket(slab, keyLo, keyHi, frameId, revision) {
    let slot = bucketSlotForKey(keyLo, keyHi);
    for (let probe = 0; probe < MAX_WALL_BUCKETS; probe++) {
        const idx = (slot + probe) & BUCKET_MASK;
        const stamp = slab.frameStamp[idx];
        if (stamp === EMPTY_STAMP) return { hit: false, slot: idx, segments: acquireBucketSegments(slab, idx) };
        if (slab.keyLo[idx] === keyLo && slab.keyHi[idx] === keyHi) {
            if (stamp === frameId && slab.revisionStamp[idx] === revision) return { hit: true, slot: idx, segments: slab.segments[idx] };
            return { hit: false, slot: idx, segments: acquireBucketSegments(slab, idx) };
        }
    }
    throw new Error(`wall candidate bucket slab full (frame ${frameId}, revision ${revision})`);
}
export function commitWallCandidateBucket(slab, slot, keyLo, keyHi, frameId, revision, segments) {
    slab.keyLo[slot] = keyLo;
    slab.keyHi[slot] = keyHi;
    slab.frameStamp[slot] = frameId;
    slab.revisionStamp[slot] = revision;
    slab.segments[slot] = segments;
}
