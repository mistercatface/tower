import { drawImageQuadScalars } from "../../Canvas/AffineTexture.js";
export function gatherTexturedQuadCellsFlat(data, count, img, uvBleed = 2) {
    const iw = img.width;
    const ih = img.height;
    for (let i = 0; i < count; i++) {
        const base = i * 13;
        const u0 = data[base + 1];
        const u1 = data[base + 2];
        const v0 = data[base + 3];
        const v1 = data[base + 4];
        data[base + 1] = u0 * iw - (u0 > 0 ? uvBleed : 0);
        data[base + 2] = u1 * iw + (u1 < 1 ? uvBleed : 0);
        data[base + 3] = v0 * ih - (v0 > 0 ? uvBleed : 0);
        data[base + 4] = v1 * ih + (v1 < 1 ? uvBleed : 0);
    }
}
export function drawTexturedQuadCellsFlat(ctx, data, indices, count, img) {
    if (count === 0) return;
    const sortedIndices = indices.subarray(0, count);
    sortedIndices.sort((a, b) => {
        return data[b * 13] - data[a * 13];
    });
    for (let i = 0; i < count; i++) {
        const base = sortedIndices[i] * 13;
        const sx0 = data[base + 1];
        const sx1 = data[base + 2];
        const sy0 = data[base + 3];
        const sy1 = data[base + 4];
        const d0x = data[base + 5];
        const d0y = data[base + 6];
        const d1x = data[base + 7];
        const d1y = data[base + 8];
        const d2x = data[base + 9];
        const d2y = data[base + 10];
        const d3x = data[base + 11];
        const d3y = data[base + 12];
        drawImageQuadScalars(ctx, img, sx0, sy0, sx1, sy1, d0x, d0y, d1x, d1y, d2x, d2y, d3x, d3y);
    }
}
