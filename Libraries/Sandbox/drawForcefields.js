import { drawCachedPropSprite, GRID_STAMP_RENDER_KEY } from "../Canvas/QuantizedSpriteCache.js";
import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { drawPortalEdgeCached } from "../Render/portalDraw.js";
import { projectPropVertex } from "../Render/Props3D/propMesh.js";
import { isForcefieldEdge, isPortalEdge, PASSAGE_MODE, resolvePassageEdge } from "../Spatial/grid/CellEdge.js";
import { gridEdgeSideFacing, gridSideOutwardVector } from "../Spatial/grid/GridUtils.js";
import { forEachCellEdge, cellEdgeEndpoints, canonicalEdgeCellKey } from "../Spatial/grid/gridCellTopology.js";
const EDGE_P1 = { x: 0, y: 0 };
const EDGE_P2 = { x: 0, y: 0 };
const FORCEFIELD_HEIGHT = 10;
/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} ax @param {number} ay @param {number} size @param {string} fillStyle */
function drawDirectionalArrow(ctx, x, y, ax, ay, size, fillStyle) {
    const perpX = -ay;
    const perpY = ax;
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(x + ax * size, y + ay * size);
    ctx.lineTo(x - ax * size * 0.35 + perpX * size * 0.55, y - ay * size * 0.35 + perpY * size * 0.55);
    ctx.lineTo(x - ax * size * 0.35 - perpX * size * 0.55, y - ay * size * 0.35 - perpY * size * 0.55);
    ctx.closePath();
    ctx.fill();
}
/** @type {import("../Render/Props3D/PropRenderer.js").PropDrawRecipe} */
const forcefieldEdgeDraw = (ctx, prop, px, py) => {
    const { mode, powered, tripped, allowedSide } = prop._forcefield;
    const { x: l1x, y: l1y } = prop._localP1;
    const { x: l2x, y: l2y } = prop._localP2;
    const lineScale = getCanvasLineScale(ctx);
    const p1Base = projectPropVertex(prop, px, py, l1x, l1y, 0);
    const p1Top = projectPropVertex(prop, px, py, l1x, l1y, FORCEFIELD_HEIGHT);
    const p2Base = projectPropVertex(prop, px, py, l2x, l2y, 0);
    const p2Top = projectPropVertex(prop, px, py, l2x, l2y, FORCEFIELD_HEIGHT);
    ctx.save();
    ctx.lineCap = "round";
    if (powered) {
        let glowColor = "rgba(239, 68, 68, 0.2)";
        let strokeColor = "#ef4444";
        if (mode === PASSAGE_MODE.Tripwire)
            if (tripped) {
                glowColor = "rgba(239, 68, 68, 0.35)";
                strokeColor = "#ef4444";
            } else {
                glowColor = "rgba(251, 146, 60, 0.25)";
                strokeColor = "#fb923c";
            }
        else if (mode === PASSAGE_MODE.OneWay) {
            const { x: ax, y: ay } = gridSideOutwardVector(allowedSide);
            const sideDot = (px - prop.x) * ax + (py - prop.y) * ay;
            if (sideDot < 0) {
                glowColor = "rgba(34, 197, 94, 0.25)";
                strokeColor = "#22c55e";
            } else {
                glowColor = "rgba(239, 68, 68, 0.25)";
                strokeColor = "#ef4444";
            }
        }
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.moveTo(p1Base.x, p1Base.y);
        ctx.lineTo(p2Base.x, p2Base.y);
        ctx.lineTo(p2Top.x, p2Top.y);
        ctx.lineTo(p1Top.x, p1Top.y);
        ctx.closePath();
        ctx.fill();
        for (const h of [2.0, 5.0, 8.0]) {
            const beamStart = projectPropVertex(prop, px, py, l1x, l1y, h);
            const beamEnd = projectPropVertex(prop, px, py, l2x, l2y, h);
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 3.5 * lineScale;
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.moveTo(beamStart.x, beamStart.y);
            ctx.lineTo(beamEnd.x, beamEnd.y);
            ctx.stroke();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.0 * lineScale;
            ctx.globalAlpha = 1.0;
            ctx.beginPath();
            ctx.moveTo(beamStart.x, beamStart.y);
            ctx.lineTo(beamEnd.x, beamEnd.y);
            ctx.stroke();
        }
    } else {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
        ctx.lineWidth = 1.2 * lineScale;
        ctx.setLineDash([4 * lineScale, 5 * lineScale]);
        for (const h of [2.0, 5.0, 8.0]) {
            const beamStart = projectPropVertex(prop, px, py, l1x, l1y, h);
            const beamEnd = projectPropVertex(prop, px, py, l2x, l2y, h);
            ctx.beginPath();
            ctx.moveTo(beamStart.x, beamStart.y);
            ctx.lineTo(beamEnd.x, beamEnd.y);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }
    ctx.strokeStyle = powered ? "#475569" : "#334155";
    ctx.lineWidth = 2.5 * lineScale;
    ctx.beginPath();
    ctx.moveTo(p1Base.x, p1Base.y);
    ctx.lineTo(p1Top.x, p1Top.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p2Base.x, p2Base.y);
    ctx.lineTo(p2Top.x, p2Top.y);
    ctx.stroke();
    ctx.fillStyle = powered ? "#64748b" : "#475569";
    ctx.beginPath();
    ctx.arc(p1Top.x, p1Top.y, 1.8 * lineScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p2Top.x, p2Top.y, 1.8 * lineScale, 0, Math.PI * 2);
    ctx.fill();
    if (mode === PASSAGE_MODE.OneWay) {
        const { x: ax, y: ay } = gridSideOutwardVector(allowedSide);
        const arrowCenter = projectPropVertex(prop, px, py, 0, 0, 5.0);
        drawDirectionalArrow(ctx, arrowCenter.x, arrowCenter.y, ax, ay, 6 * lineScale, powered ? "rgba(255, 255, 255, 0.95)" : "rgba(255, 255, 255, 0.45)");
    }
    ctx.restore();
};
/** @param {number} midX @param {number} midY @param {number} side @param {number} cellHalf @param {number} edgeKey @param {{ mode: string, allowedSide: number, powered: boolean, tripped: boolean }} field */
function createForcefieldDrawProxy(midX, midY, side, cellHalf, edgeKey, { mode, allowedSide, powered, tripped }) {
    return {
        x: midX,
        y: midY,
        facing: gridEdgeSideFacing(side),
        radius: cellHalf,
        halfExtents: { x: cellHalf, y: cellHalf },
        _forcefield: { mode, allowedSide, powered, tripped },
        _localP1: { x: EDGE_P1.x - midX, y: EDGE_P1.y - midY },
        _localP2: { x: EDGE_P2.x - midX, y: EDGE_P2.y - midY },
        getCustomSpriteCacheKey() {
            return `${edgeKey}_${mode}_${powered ? 1 : 0}_${allowedSide}`;
        },
    };
}
/** @param {object} state @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
function passageEdgeDrawRevision(state, grid) {
    return `${grid.wallGridRevision}:${grid._passagePowerNavKey ?? ""}`;
}
/** @param {object} state @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
function syncPassageEdgeDrawCache(state, grid) {
    const revision = passageEdgeDrawRevision(state, grid);
    if (state.sandbox._passageEdgeDrawCache?.revision === revision) return;
    /** @type {Array<{ type: "portal", col: number, row: number, side: number, edge: object, midX: number, midY: number } | { type: "forcefield", proxy: ReturnType<typeof createForcefieldDrawProxy>, edgeKey: number, midX: number, midY: number }>} */
    const items = [];
    forEachCellEdge(
        grid,
        (col, row, side, edge) => {
            cellEdgeEndpoints(grid, col, row, side, EDGE_P1, EDGE_P2, 0);
            const midX = (EDGE_P1.x + EDGE_P2.x) * 0.5;
            const midY = (EDGE_P1.y + EDGE_P2.y) * 0.5;
            if (isPortalEdge(edge)) items.push({ type: "portal", col, row, side, edge, midX, midY });
            else {
                const { mode, allowedSide, powered } = resolvePassageEdge(edge, side);
                const cellHalf = grid.cellHalfSize;
                const edgeKey = canonicalEdgeCellKey(grid, col, row, side);
                items.push({ type: "forcefield", proxy: createForcefieldDrawProxy(midX, midY, side, cellHalf, edgeKey, { mode, allowedSide, powered, tripped: false }), edgeKey, midX, midY });
            }
        },
        { canonicalOnly: true, filter: isForcefieldEdge },
    );
    state.sandbox._passageEdgeDrawCache = { revision, items };
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {import("../Viewport/Viewport.js").Viewport} viewport
 */
export function drawForcefieldEdges(ctx, state, viewport) {
    const grid = state.obstacleGrid;
    if (!grid.cols || !grid.edgeStore.passageEdgeCount) return;
    syncPassageEdgeDrawCache(state, grid);
    const cached = state.sandbox._passageEdgeDrawCache.items;
    const bounds = viewport.boundsVisibleDefault;
    const minX = bounds.minX;
    const maxX = bounds.maxX;
    const minY = bounds.minY;
    const maxY = bounds.maxY;
    const tripwireTriggered = state.sandbox.tripwireTriggeredKeys;
    const px = viewport.x;
    const py = viewport.y;
    const drawables = [];
    for (let i = 0; i < cached.length; i++) {
        const item = cached[i];
        if (item.midX < minX || item.midX > maxX || item.midY < minY || item.midY > maxY) continue;
        const distSq = (item.midX - px) ** 2 + (item.midY - py) ** 2;
        if (item.type === "portal") drawables.push({ type: "portal", col: item.col, row: item.row, side: item.side, edge: item.edge, distSq });
        else {
            const tripped = item.proxy._forcefield.powered && tripwireTriggered.has(item.edgeKey);
            if (tripped !== item.proxy._forcefield.tripped) item.proxy._forcefield.tripped = tripped;
            drawables.push({ type: "forcefield", proxy: item.proxy, distSq });
        }
    }
    drawables.sort((a, b) => b.distSq - a.distSq);
    for (let i = 0; i < drawables.length; i++) {
        const item = drawables[i];
        if (item.type === "portal") drawPortalEdgeCached(ctx, grid, item.col, item.row, item.side, item.edge, px, py, { ageMs: state.gameTime });
        else drawCachedPropSprite(ctx, item.proxy, px, py, GRID_STAMP_RENDER_KEY.ForcefieldEdge, forcefieldEdgeDraw);
    }
}
