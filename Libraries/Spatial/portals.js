import { GRID_STAMP_RENDER_KEY, BELT_FILMSTRIP_FRAMES, BELT_FRAME_MS, drawCachedGridStampFilmstripShared } from "../Canvas/canvas.js";
export const PORTAL_NONE = -1;
function bumpFloorNavEpoch(grid) {
    grid.floorNavEpoch = (grid.floorNavEpoch + 1) | 0;
    grid.invalidateNavTopology();
}
export class PortalLink {
    static isExit(grid, idx) {
        return grid.portalTargetIdx[idx] >= 0;
    }
    static targetIdx(grid, idx) {
        const target = grid.portalTargetIdx[idx];
        return target >= 0 ? target : PORTAL_NONE;
    }
    static blocksStep(grid, fromIdx, toIdx) {
        if (PortalLink.isExit(grid, fromIdx)) return true;
        return false;
    }
    static portalHopBetween(portalTargetIdx, fromIdx, toIdx) {
        return portalTargetIdx[fromIdx] === toIdx;
    }
    static setLink(grid, exitIdx, entryIdx) {
        if (exitIdx < 0 || exitIdx >= grid.cols * grid.rows) throw new Error(`portal exit idx out of bounds: ${exitIdx}`);
        if (entryIdx < 0 || entryIdx >= grid.cols * grid.rows) throw new Error(`portal entry idx out of bounds: ${entryIdx}`);
        if (exitIdx === entryIdx) throw new Error("portal exit and entry must differ");
        if (grid.grid[exitIdx] !== 0 || grid.grid[entryIdx] !== 0) throw new Error("portal cells must be open");
        const prevTarget = grid.portalTargetIdx[exitIdx];
        const hadLink = prevTarget >= 0;
        grid.portalTargetIdx[exitIdx] = entryIdx;
        if (!hadLink) grid.portalLinkCount++;
        bumpFloorNavEpoch(grid);
        return { exitIdx, entryIdx };
    }
    static clearAt(grid, idx) {
        if (idx < 0 || idx >= grid.cols * grid.rows) return false;
        if (grid.portalTargetIdx[idx] === PORTAL_NONE) return false;
        grid.portalTargetIdx[idx] = PORTAL_NONE;
        grid.portalLinkCount--;
        bumpFloorNavEpoch(grid);
        return true;
    }
}
export class FloorPortal {
    static tick(state, spatialFrame) {
        const grid = state.obstacleGrid;
        if (grid.portalLinkCount === 0) return;
        const kineticBodies = spatialFrame._kineticBodies;
        if (!kineticBodies?.length) return;
        for (let i = 0; i < kineticBodies.length; i++) {
            const entity = kineticBodies[i];
            const idx = grid.worldToIdx(entity.x, entity.y);
            if (idx < 0) continue;
            const targetIdx = grid.portalTargetIdx[idx];
            if (targetIdx < 0) continue;
            entity.x = grid.gridCenterXByIdx(targetIdx);
            entity.y = grid.gridCenterYByIdx(targetIdx);
        }
    }
    static listLinksForSnapshot(grid) {
        const items = [];
        const size = grid.cols * grid.rows;
        for (let idx = 0; idx < size; idx++) {
            const targetIdx = grid.portalTargetIdx[idx];
            if (targetIdx < 0) continue;
            items.push({ exitIdx: idx, entryIdx: targetIdx });
        }
        return items;
    }
    static applyFromSnapshot(grid, links) {
        grid.portalTargetIdx.fill(PORTAL_NONE);
        grid.portalLinkCount = 0;
        for (let i = 0; i < links.length; i++) {
            const { exitIdx, entryIdx } = links[i];
            PortalLink.setLink(grid, exitIdx, entryIdx);
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
const PORTAL_HALF_EXTENTS = { x: 0, y: 0 };
export function drawFloorPortals(ctx, state, viewport) {
    const grid = state.obstacleGrid;
    if (grid.portalLinkCount === 0) return;
    const cellHalf = grid.cellHalfSize;
    PORTAL_HALF_EXTENTS.x = cellHalf;
    PORTAL_HALF_EXTENTS.y = cellHalf;
    const size = grid.cols * grid.rows;
    const frameIndex = Math.floor(state.gameTime / BELT_FRAME_MS) % BELT_FILMSTRIP_FRAMES;
    for (let idx = 0; idx < size; idx++) {
        const target = grid.portalTargetIdx[idx];
        if (target < 0) continue;
        drawPortalStamp(ctx, grid, viewport, idx, "exit", frameIndex);
        drawPortalStamp(ctx, grid, viewport, target, "entry", frameIndex);
    }
}
function drawPortalStamp(ctx, grid, viewport, idx, role, frameIndex) {
    const x = grid.gridCenterXByIdx(idx);
    const y = grid.gridCenterYByIdx(idx);
    if (!viewport.circleInBounds(x, y, grid.cellHalfSize, "props")) return;
    const draw = role === "exit" ? PORTAL_EXIT_DRAW : PORTAL_ENTRY_DRAW;
    drawCachedGridStampFilmstripShared(ctx, x, y, PORTAL_HALF_EXTENTS, viewport, GRID_STAMP_RENDER_KEY.Portal, role, 0, draw, frameIndex, BELT_FILMSTRIP_FRAMES);
}
