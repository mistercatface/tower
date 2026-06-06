import { drawImageQuad } from "../../Canvas/AffineTexture.js";
/**
 * @param {{ u0: number, u1: number, v0: number, v1: number, depth: number, d0: object, d1: object, d2: object, d3: object }[]} rawCells
 * @param {CanvasImageSource} img
 * @param {number} [uvBleed]
 * @param {{ collectHull?: boolean }} [options]
 */
export function gatherTexturedQuadCells(rawCells, img, uvBleed = 2, { collectHull = false } = {}) {
    const iw = img.width;
    const ih = img.height;
    const cells = [];
    const hullTop = [];
    const hullBot = [];
    for (const cell of rawCells) {
        const { u0, u1, v0, v1, d0, d1, d2, d3, depth } = cell;
        const sx0 = u0 * iw - (u0 > 0 ? uvBleed : 0);
        const sx1 = u1 * iw + (u1 < 1 ? uvBleed : 0);
        const sy0 = v0 * ih - (v0 > 0 ? uvBleed : 0);
        const sy1 = v1 * ih + (v1 < 1 ? uvBleed : 0);
        cells.push({ depth, sx0, sy0, sx1, sy1, d0, d1, d2, d3 });
        if (collectHull) {
            if (v0 === 0) {
                if (u0 === 0) hullTop.push(d0);
                hullTop.push(d1);
            }
            if (v1 === 1) {
                if (u0 === 0) hullBot.push(d3);
                hullBot.push(d2);
            }
        }
    }
    if (collectHull) return { cells, hull: [...hullTop, ...hullBot.slice().reverse()] };
    return cells;
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ depth: number, sx0: number, sy0: number, sx1: number, sy1: number, d0: object, d1: object, d2: object, d3: object }[]} cells
 * @param {CanvasImageSource} img
 * @param {{ screenBleed?: number, imageSmoothing?: boolean | null }} [options]
 */
export function drawTexturedQuadCells(ctx, cells, img, options = {}) {
    if (!cells.length) return;
    const sorted = [...cells].sort((a, b) => b.depth - a.depth);
    const textureOpts = { underlay: null, bleedPx: options.screenBleed ?? 0 };
    const prevSmooth = ctx.imageSmoothingEnabled;
    if (options.imageSmoothing != null) ctx.imageSmoothingEnabled = options.imageSmoothing;
    for (const cell of sorted) drawImageQuad(ctx, img, cell.sx0, cell.sy0, cell.sx1, cell.sy1, cell.d0, cell.d1, cell.d2, cell.d3, textureOpts);
    if (options.imageSmoothing != null) ctx.imageSmoothingEnabled = prevSmooth;
}
