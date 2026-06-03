export function createWallFaceAxes(p1, p2) {
    const edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const dirX = (p2.x - p1.x) / edgeLen;
    const dirY = (p2.y - p1.y) / edgeLen;
    return { dirX, dirY, foldX: -dirY, foldY: dirX };
}

/**
 * Per-bake constants for filling sample buffers. Built once per paintPixelArea call.
 * @param {{ startWorldX: number, startWorldY: number, cellSize: number, surfaceKind: string, height: number, width: number, pixelsPerUnit: number, zOffset: number, wallFace: object | null }} params
 */
export function buildMapContext({ startWorldX, startWorldY, cellSize, surfaceKind, height, width, pixelsPerUnit, zOffset, wallFace }) {
    const invPpwu = 1 / pixelsPerUnit;
    const ctx = { surfaceKind, invPpwu };
    if (surfaceKind === "wallFace") {
        const wf = wallFace;
        const maxZ = height > 1 ? (height - 1) * invPpwu : 0;
        const edgeLen = wf.edgeLen > 0 ? wf.edgeLen : 1;
        ctx.height = height;
        ctx.p1x = wf.p1.x;
        ctx.p1y = wf.p1.y;
        ctx.dirX = wf.dirX;
        ctx.dirY = wf.dirY;
        ctx.foldX = wf.foldX;
        ctx.foldY = wf.foldY;
        ctx.invEdgeLen = 1 / edgeLen;
        ctx.maxZ = maxZ;
        ctx.invMaxZ = maxZ > 0 ? 1 / maxZ : 0;
    } else if (surfaceKind === "wallCell") {
        ctx.startWorldX = startWorldX;
        ctx.startWorldY = startWorldY;
        ctx.cellSize = cellSize;
        ctx.zOffset = zOffset;
        ctx.height = height;
        ctx.spanU = width > 1 ? width - 1 : 1;
    } else {
        ctx.startWorldX = startWorldX;
        ctx.startWorldY = startWorldY;
    }
    return ctx;
}

/** Write eval/wall UV samples for one pixel into pooled Float32Arrays. */
export function writePixelToSamples(samples, idx, x, y, mapCtx) {
    const invPpwu = mapCtx.invPpwu;
    if (mapCtx.surfaceKind === "wallFace") {
        const z = (mapCtx.height - 1 - y) * invPpwu;
        const dist = x * invPpwu;
        samples.evalX[idx] = mapCtx.p1x + dist * mapCtx.dirX + mapCtx.foldX * z;
        samples.evalY[idx] = mapCtx.p1y + dist * mapCtx.dirY + mapCtx.foldY * z;
        samples.wallU[idx] = dist * mapCtx.invEdgeLen;
        samples.wallV[idx] = mapCtx.maxZ > 0 ? z * mapCtx.invMaxZ : 0;
        return;
    }
    if (mapCtx.surfaceKind === "wallCell") {
        samples.evalX[idx] = mapCtx.startWorldX + x * invPpwu;
        samples.evalY[idx] = mapCtx.startWorldY + (mapCtx.cellSize - y * invPpwu) + mapCtx.zOffset;
        samples.wallU[idx] = x / mapCtx.spanU;
        samples.wallV[idx] = mapCtx.height > 1 ? (mapCtx.height - 1 - y) / (mapCtx.height - 1) : 0;
        return;
    }
    samples.evalX[idx] = mapCtx.startWorldX + x * invPpwu;
    samples.evalY[idx] = mapCtx.startWorldY + y * invPpwu;
    samples.wallU[idx] = 0;
    samples.wallV[idx] = 0;
}
