import { GRID_STAMP_RENDER_KEY, BELT_FILMSTRIP_FRAMES, BELT_FRAME_MS, drawCachedGridStampFilmstripShared, warmSharedGridStampFilmstripCache } from "../Canvas/canvas.js";
import { forEachCardinalNeighborIdx } from "./spatial.js";
export const PORTAL_NONE = -1;
const PORTAL_STRIP_KEYS = ["exit", "entry"];
function bumpFloorNavEpoch(grid) {
    grid.floorNavEpoch = (grid.floorNavEpoch + 1) | 0;
    grid.invalidateNavTopology();
}
function growActivePortalPairsIfNeeded(grid, minLength) {
    if (minLength <= grid.activePortalPairs.length) return;
    const grown = new Int32Array(Math.max(minLength, grid.activePortalPairs.length * 2));
    grown.set(grid.activePortalPairs);
    grid.activePortalPairs = grown;
}
function upsertActivePortalPair(grid, exitIdx, entryIdx) {
    const pairs = grid.activePortalPairs;
    const count = grid.activePortalCount;
    for (let i = 0; i < count; i++)
        if (pairs[i * 2] === exitIdx) {
            pairs[i * 2 + 1] = entryIdx;
            return;
        }
    growActivePortalPairsIfNeeded(grid, (count + 1) * 2);
    const w = count * 2;
    grid.activePortalPairs[w] = exitIdx;
    grid.activePortalPairs[w + 1] = entryIdx;
    grid.activePortalCount = count + 1;
}
function removeActivePortalPair(grid, exitIdx) {
    const pairs = grid.activePortalPairs;
    let count = grid.activePortalCount;
    for (let i = 0; i < count; i++) {
        if (pairs[i * 2] !== exitIdx) continue;
        const last = count - 1;
        if (i !== last) {
            pairs[i * 2] = pairs[last * 2];
            pairs[i * 2 + 1] = pairs[last * 2 + 1];
        }
        grid.activePortalCount = last;
        return;
    }
}
export class PortalLink {
    static isExit(grid, idx) {
        if (grid.portalTargetIdx) return grid.portalTargetIdx[idx] >= 0;
        const pairs = grid.activePortalPairs;
        if (!pairs) return false;
        const count = grid.activePortalCount;
        const len = typeof count === "number" ? count : count[0];
        for (let i = 0; i < len; i++) if (pairs[i * 2] === idx) return true;
        return false;
    }
    static targetIdx(grid, idx) {
        if (grid.portalTargetIdx) {
            const target = grid.portalTargetIdx[idx];
            return target >= 0 ? target : PORTAL_NONE;
        }
        const pairs = grid.activePortalPairs;
        if (!pairs) return PORTAL_NONE;
        const count = grid.activePortalCount;
        const len = typeof count === "number" ? count : count[0];
        for (let i = 0; i < len; i++) if (pairs[i * 2] === idx) return pairs[i * 2 + 1];
        return PORTAL_NONE;
    }
    static blocksStep(grid, fromIdx, toIdx) {
        if (PortalLink.isExit(grid, fromIdx)) return true;
        return false;
    }
    static approachGoalIdx(grid, fromIdx, targetIdx) {
        if (!PortalLink.isExit(grid, targetIdx)) return targetIdx;
        if (fromIdx === targetIdx) return targetIdx;
        let approach = -1;
        forEachCardinalNeighborIdx(targetIdx, grid, (nIdx) => {
            if (grid.grid[nIdx] !== 0) return;
            if (PortalLink.isExit(grid, nIdx)) return;
            if (fromIdx === nIdx) {
                approach = nIdx;
                return;
            }
            if (approach < 0) approach = nIdx;
        });
        return approach >= 0 ? approach : targetIdx;
    }
    static portalHopBetween(portalTargetIdx, fromIdx, toIdx) {
        return portalTargetIdx[fromIdx] === toIdx;
    }
    static setLink(grid, exitIdx, entryIdx) {
        if (exitIdx < 0 || exitIdx >= grid.cols * grid.rows) throw new Error(`portal exit idx out of bounds: ${exitIdx}`);
        if (entryIdx < 0 || entryIdx >= grid.cols * grid.rows) throw new Error(`portal entry idx out of bounds: ${entryIdx}`);
        if (exitIdx === entryIdx) throw new Error("portal exit and entry must differ");
        if (grid.grid[exitIdx] !== 0 || grid.grid[entryIdx] !== 0) throw new Error("portal cells must be open");
        grid.portalTargetIdx[exitIdx] = entryIdx;
        upsertActivePortalPair(grid, exitIdx, entryIdx);
        bumpFloorNavEpoch(grid);
    }
    static clearAt(grid, idx) {
        if (idx < 0 || idx >= grid.cols * grid.rows) return false;
        if (grid.portalTargetIdx[idx] === PORTAL_NONE) return false;
        grid.portalTargetIdx[idx] = PORTAL_NONE;
        removeActivePortalPair(grid, idx);
        bumpFloorNavEpoch(grid);
        return true;
    }
}
export class FloorPortal {
    static listLinksForSnapshot(grid) {
        const items = [];
        const pairs = grid.activePortalPairs;
        const count = grid.activePortalCount;
        for (let i = 0; i < count; i++) items.push({ exitIdx: pairs[i * 2], entryIdx: pairs[i * 2 + 1] });
        return items;
    }
    static applyFromSnapshot(grid, links) {
        grid.portalTargetIdx.fill(PORTAL_NONE);
        grid.activePortalCount = 0;
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            PortalLink.setLink(grid, link.exitIdx, link.entryIdx);
        }
    }
}
const PORTAL_EXIT_PALETTE = { ring: "#ff7a2f", glow: "rgba(255,122,47,0.35)", core: "#ffd9b0" };
const PORTAL_ENTRY_PALETTE = { ring: "#3fa9ff", glow: "rgba(63,169,255,0.35)", core: "#bfe4ff" };
function portalDrawForPalette(palette) {
    return (ctx, prop) => {
        const r = prop.radius * 0.82;
        const twist = ((prop.ageMs ?? 0) / (BELT_FRAME_MS * BELT_FILMSTRIP_FRAMES)) * Math.PI * 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = palette.glow;
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, r * 0.16);
        ctx.strokeStyle = palette.ring;
        ctx.stroke();
        ctx.rotate(twist);
        for (let arm = 0; arm < 3; arm++) {
            ctx.rotate((Math.PI * 2) / 3);
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.6, 0, Math.PI * 0.6);
            ctx.lineWidth = Math.max(1.2, r * 0.13);
            ctx.strokeStyle = palette.ring;
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = palette.core;
        ctx.fill();
        ctx.restore();
    };
}
const PORTAL_EXIT_DRAW = portalDrawForPalette(PORTAL_EXIT_PALETTE);
const PORTAL_ENTRY_DRAW = portalDrawForPalette(PORTAL_ENTRY_PALETTE);
function portalDrawForStripKey(role) {
    return role === "exit" ? PORTAL_EXIT_DRAW : PORTAL_ENTRY_DRAW;
}
function drawPortalStamp(ctx, grid, viewport, idx, role, frameIndex, halfExtents) {
    const x = grid.gridCenterXByIdx(idx);
    const y = grid.gridCenterYByIdx(idx);
    if (!viewport.circleInBoundsF32(x, y, grid.cellHalfSize, "props")) return;
    drawCachedGridStampFilmstripShared(ctx, x, y, halfExtents, viewport, GRID_STAMP_RENDER_KEY.Portal, role, 0, portalDrawForStripKey(role), frameIndex, BELT_FILMSTRIP_FRAMES);
}
export class FloorPortalDrawCache {
    constructor() {
        this.revision = -1;
        this.halfExtents = { x: 0, y: 0 };
    }
    static clear(state) {
        if (!state.sandbox) return;
        state.sandbox.floorPortalDrawCache = null;
    }
    sync(state, grid, viewport) {
        if (!state.sandbox) return null;
        if (!state.sandbox.floorPortalDrawCache) state.sandbox.floorPortalDrawCache = new FloorPortalDrawCache();
        const cache = state.sandbox.floorPortalDrawCache;
        const revision = (grid.floorNavEpoch << 16) | grid.activePortalCount;
        if (cache.revision === revision) return cache;
        cache.revision = revision;
        const cellHalf = grid.cellHalfSize;
        cache.halfExtents.x = cellHalf;
        cache.halfExtents.y = cellHalf;
        if (viewport && grid.activePortalCount > 0) warmSharedGridStampFilmstripCache(viewport, cellHalf, GRID_STAMP_RENDER_KEY.Portal, PORTAL_STRIP_KEYS, 2, () => 0, portalDrawForStripKey, BELT_FILMSTRIP_FRAMES);
        return cache;
    }
    draw(ctx, state, grid, viewport) {
        const count = grid.activePortalCount;
        if (count === 0) return;
        const pairs = grid.activePortalPairs;
        const frameIndex = Math.floor(state.gameTime / BELT_FRAME_MS) % BELT_FILMSTRIP_FRAMES;
        const halfExtents = this.halfExtents;
        for (let i = 0; i < count; i++) {
            drawPortalStamp(ctx, grid, viewport, pairs[i * 2], "exit", frameIndex, halfExtents);
            drawPortalStamp(ctx, grid, viewport, pairs[i * 2 + 1], "entry", frameIndex, halfExtents);
        }
    }
}
export function drawFloorPortals(ctx, state, viewport) {
    const grid = state.obstacleGrid;
    if (grid.activePortalCount === 0) return;
    if (!state.sandbox) return;
    if (!state.sandbox.floorPortalDrawCache) state.sandbox.floorPortalDrawCache = new FloorPortalDrawCache();
    const cache = state.sandbox.floorPortalDrawCache.sync(state, grid, viewport);
    cache.draw(ctx, state, grid, viewport);
}
