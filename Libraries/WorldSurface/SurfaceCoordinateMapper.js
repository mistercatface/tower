/** Baked wall-face atlas height in world units (front face + top-edge strip). */
export function wallFaceAtlasUnrolledHeight(wallHeight, wallWidth) {
    return wallHeight + wallWidth;
}

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
export function buildMapContext({ startWorldX, startWorldY, cellSize, surfaceKind, height, width, pixelsPerUnit, zOffset, wallFace, wallHeight = null, wallWidth = null }) {
    const invPpwu = 1 / pixelsPerUnit;
    const ctx = { surfaceKind, invPpwu };
    if (surfaceKind === "wallFace") {
        const wf = wallFace;
        ctx.height = height;
        ctx.p1x = wf.p1.x;
        ctx.p1y = wf.p1.y;
        ctx.dirX = wf.dirX;
        ctx.dirY = wf.dirY;
        ctx.foldX = wf.foldX;
        ctx.foldY = wf.foldY;
        ctx.invEdgeLen = wf.edgeLen > 0 ? 1 / wf.edgeLen : 1;
        if (wallHeight == null) {
            throw new Error("buildMapContext wallFace requires wallHeight");
        }
        ctx.wallHeight = wallHeight;
        ctx.wallWidth = wallWidth ?? cellSize;
    } else if (surfaceKind === "wallCell") {
        ctx.startWorldX = startWorldX;
        ctx.startWorldY = startWorldY;
        ctx.cellSize = cellSize;
        ctx.zOffset = zOffset;
        ctx.height = height;
        ctx.spanU = width > 1 ? width - 1 : 1;
    } else if (surfaceKind === "roof") {
        ctx.startWorldX = startWorldX;
        ctx.startWorldY = startWorldY;
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
        const v = (mapCtx.height - 1 - y) * invPpwu;
        const dist = x * invPpwu;
        const H = mapCtx.wallHeight;
        const W = mapCtx.wallWidth;

        let foldOffset = 0;
        let wallV = 0;

        if (v < W) {
            // Top-edge strip (wallV = 1 at the cap)
            foldOffset = H + v;
            wallV = 1.0;
        } else {
            // Front face
            const z = H + W - v;
            foldOffset = z;
            wallV = z / H;
        }

        samples.evalX[idx] = mapCtx.p1x + dist * mapCtx.dirX + mapCtx.foldX * foldOffset;
        samples.evalY[idx] = mapCtx.p1y + dist * mapCtx.dirY + mapCtx.foldY * foldOffset;
        samples.wallU[idx] = dist * mapCtx.invEdgeLen;
        samples.wallV[idx] = wallV;
        return;
    }
    if (mapCtx.surfaceKind === "wallCell") {
        samples.evalX[idx] = mapCtx.startWorldX + x * invPpwu;
        samples.evalY[idx] = mapCtx.startWorldY + (mapCtx.cellSize - y * invPpwu) + mapCtx.zOffset;
        samples.wallU[idx] = x / mapCtx.spanU;
        samples.wallV[idx] = mapCtx.height > 1 ? (mapCtx.height - 1 - y) / (mapCtx.height - 1) : 0;
        return;
    }
    if (mapCtx.surfaceKind === "roof") {
        samples.evalX[idx] = mapCtx.startWorldX + x * invPpwu;
        samples.evalY[idx] = mapCtx.startWorldY + y * invPpwu;
        samples.wallU[idx] = x / mapCtx.spanU;
        samples.wallV[idx] = 1;
        return;
    }
    samples.evalX[idx] = mapCtx.startWorldX + x * invPpwu;
    samples.evalY[idx] = mapCtx.startWorldY + y * invPpwu;
    samples.wallU[idx] = 0;
    samples.wallV[idx] = 0;
}
