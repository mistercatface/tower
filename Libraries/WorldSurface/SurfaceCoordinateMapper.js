export function createWallFaceAxes(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const edgeLen = Math.hypot(dx, dy);
    if (edgeLen <= 0) return { edgeLen: 0, dirX: 0, dirY: 0, foldX: 0, foldY: 0 };
    const dirX = dx / edgeLen;
    const dirY = dy / edgeLen;
    return { edgeLen, dirX, dirY, foldX: -dirY, foldY: dirX };
}
export function writeFloorPixel(samples, idx, x, y, mapCtx) {
    const invPpwu = mapCtx.invPpwu;
    samples.evalX[idx] = mapCtx.startWorldX + x * invPpwu;
    samples.evalY[idx] = mapCtx.startWorldY + y * invPpwu;
    samples.wallU[idx] = 0;
    samples.wallV[idx] = 0;
}
export function fillWallFaceRows(samples, width, height, mapCtx) {
    const invPpwu = mapCtx.invPpwu;
    const H = mapCtx.wallHeight;
    const W = mapCtx.wallWidth;
    const heightPx = mapCtx.height;
    const dirX = mapCtx.dirX;
    const dirY = mapCtx.dirY;
    const foldX = mapCtx.foldX;
    const foldY = mapCtx.foldY;
    const invEdgeLen = mapCtx.invEdgeLen;
    const p1x = mapCtx.p1x;
    const p1y = mapCtx.p1y;
    let idx = 0;
    for (let y = 0; y < height; y++) {
        const v = (heightPx - 1 - y) * invPpwu;
        let evalXBase;
        let evalYBase;
        let wallV;
        if (v < W) {
            const foldOffset = H + v;
            evalXBase = p1x + foldX * foldOffset;
            evalYBase = p1y + foldY * foldOffset;
            wallV = 1;
        } else {
            const z = H + W - v;
            const foldOffset = z;
            evalXBase = p1x + foldX * foldOffset;
            evalYBase = p1y + foldY * foldOffset;
            wallV = z / H;
        }
        for (let x = 0; x < width; x++, idx++) {
            const dist = x * invPpwu;
            samples.evalX[idx] = evalXBase + dist * dirX;
            samples.evalY[idx] = evalYBase + dist * dirY;
            samples.wallU[idx] = dist * invEdgeLen;
            samples.wallV[idx] = wallV;
        }
    }
}
export function writeWallFacePixel(samples, idx, x, y, mapCtx) {
    const invPpwu = mapCtx.invPpwu;
    const v = (mapCtx.height - 1 - y) * invPpwu;
    const dist = x * invPpwu;
    const H = mapCtx.wallHeight;
    const W = mapCtx.wallWidth;
    let foldOffset = 0;
    let wallV = 0;
    if (v < W) {
        foldOffset = H + v;
        wallV = 1.0;
    } else {
        const z = H + W - v;
        foldOffset = z;
        wallV = z / H;
    }
    samples.evalX[idx] = mapCtx.p1x + dist * mapCtx.dirX + mapCtx.foldX * foldOffset;
    samples.evalY[idx] = mapCtx.p1y + dist * mapCtx.dirY + mapCtx.foldY * foldOffset;
    samples.wallU[idx] = dist * mapCtx.invEdgeLen;
    samples.wallV[idx] = wallV;
}
export function writeWallCellPixel(samples, idx, x, y, mapCtx) {
    const invPpwu = mapCtx.invPpwu;
    samples.evalX[idx] = mapCtx.startWorldX + x * invPpwu;
    samples.evalY[idx] = mapCtx.startWorldY + (mapCtx.cellSize - y * invPpwu) + mapCtx.zOffset;
    samples.wallU[idx] = x / mapCtx.spanU;
    samples.wallV[idx] = (mapCtx.height - 1 - y) * mapCtx.invWallCellVSpan;
}
export function writeRoofPixel(samples, idx, x, y, mapCtx) {
    const invPpwu = mapCtx.invPpwu;
    samples.evalX[idx] = mapCtx.startWorldX + x * invPpwu;
    samples.evalY[idx] = mapCtx.startWorldY + y * invPpwu;
    samples.wallU[idx] = x / mapCtx.spanU;
    samples.wallV[idx] = 1;
}
