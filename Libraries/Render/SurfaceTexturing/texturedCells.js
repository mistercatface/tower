import { drawImageQuadScalars } from "../../Canvas/AffineTexture.js";
/** @type {{ depth: number, sx0: number, sy0: number, sx1: number, sy1: number, d0: object, d1: object, d2: object, d3: object }[]} */
const sDrawCells = [];
/** @type {object[]} */
const sHullTop = [];
/** @type {object[]} */
const sHullBot = [];
/** @type {object[]} */
const sHullOut = [];
/** @param {number} index */
function borrowDrawCell(index) {
    while (sDrawCells.length <= index) sDrawCells.push({ depth: 0, sx0: 0, sy0: 0, sx1: 0, sy1: 0, d0: { x: 0, y: 0 }, d1: { x: 0, y: 0 }, d2: { x: 0, y: 0 }, d3: { x: 0, y: 0 } });
    return sDrawCells[index];
}
/** @param {object[]} top @param {object[]} bot @returns {object[]} Module scratch — consume immediately. */
function buildHullScratch(top, bot) {
    let n = 0;
    for (let i = 0; i < top.length; i++) sHullOut[n++] = top[i];
    for (let i = bot.length - 1; i >= 0; i--) sHullOut[n++] = bot[i];
    sHullOut.length = n;
    return sHullOut;
}
/**
 * Project UV cells to screen-space draw cells. Returns module scratch — do not store; redraw before next gather.
 *
 * @param {{ u0: number, u1: number, v0: number, v1: number, depth: number, d0: object, d1: object, d2: object, d3: object }[]} rawCells
 * @param {CanvasImageSource} img
 * @param {number} [uvBleed]
 * @param {{ collectHull?: boolean }} [options]
 * @returns {{ depth: number, sx0: number, sy0: number, sx1: number, sy1: number, d0: object, d1: object, d2: object, d3: object }[] | { cells: typeof sDrawCells, hull: typeof sHullOut }}
 */
export function gatherTexturedQuadCells(rawCells, img, uvBleed = 2, { collectHull = false } = {}) {
    const iw = img.width;
    const ih = img.height;
    let count = 0;
    if (collectHull) {
        sHullTop.length = 0;
        sHullBot.length = 0;
    }
    for (let i = 0; i < rawCells.length; i++) {
        const cell = rawCells[i];
        const { u0, u1, v0, v1, d0, d1, d2, d3, depth } = cell;
        const out = borrowDrawCell(count++);
        out.depth = depth;
        out.sx0 = u0 * iw - (u0 > 0 ? uvBleed : 0);
        out.sx1 = u1 * iw + (u1 < 1 ? uvBleed : 0);
        out.sy0 = v0 * ih - (v0 > 0 ? uvBleed : 0);
        out.sy1 = v1 * ih + (v1 < 1 ? uvBleed : 0);
        out.d0 = d0;
        out.d1 = d1;
        out.d2 = d2;
        out.d3 = d3;
        if (collectHull) {
            if (v0 === 0) {
                if (u0 === 0) sHullTop.push(d0);
                sHullTop.push(d1);
            }
            if (v1 === 1) {
                if (u0 === 0) sHullBot.push(d3);
                sHullBot.push(d2);
            }
        }
    }
    sDrawCells.length = count;
    if (collectHull) return { cells: sDrawCells, hull: buildHullScratch(sHullTop, sHullBot) };
    return sDrawCells;
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ depth: number, sx0: number, sy0: number, sx1: number, sy1: number, d0: object, d1: object, d2: object, d3: object }[]} cells
 * @param {CanvasImageSource} img
 */
export function drawTexturedQuadCells(ctx, cells, img) {
    if (!cells.length) return;
    cells.sort((a, b) => b.depth - a.depth);
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        drawImageQuadScalars(ctx, img, cell.sx0, cell.sy0, cell.sx1, cell.sy1, cell.d0.x, cell.d0.y, cell.d1.x, cell.d1.y, cell.d2.x, cell.d2.y, cell.d3.x, cell.d3.y);
    }
}
