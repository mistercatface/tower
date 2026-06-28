import { drawCachedPropSprite, GRID_STAMP_RENDER_KEY } from "../Canvas/QuantizedSpriteCache.js";
import { fillCircle } from "../Canvas/CanvasPath.js";
import { floorBeltFacingFromIndex, floorBeltElbowTurn, isFloorBeltKind, isFloorBeltRailsKind } from "../Spatial/grid/FloorCell.js";
import { floorOccupancyStampDrawCacheKey, passageEdgeDrawCacheKey } from "../Spatial/grid/gridNavEpoch.js";
import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { createConveyorDraw } from "../Render/conveyorDraw.js";
import { isForcefieldEdge, PASSAGE_MODE, resolvePassageEdge } from "../Spatial/grid/CellEdge.js";
import { gridEdgeSideFacing, gridSideOutwardVector } from "../Spatial/grid/GridUtils.js";
import { forEachCellEdge, cellEdgeEndpoints, canonicalEdgeCellKey } from "../Spatial/grid/gridCellTopology.js";
import { isPassagePowerSourceEnergized } from "./passagePowerNetwork.js";
import { DRAW_KIND_FORCEFIELD } from "../Render/Structure3D/VisibleDrawQueue.js";
import { projectPropVertexScalarsInto } from "../Render/Props3D/propMesh.js";
const SHARED_HALF_EXTENTS = { x: 0, y: 0 };
const EDGE_P1 = { x: 0, y: 0 };
const EDGE_P2 = { x: 0, y: 0 };
const FORCEFIELD_HEIGHT = 10;
const RAILED_BELT_RAIL_COLORS = { shadow: "#450A0A", mid: "#7F1D1D", highlight: "#991B1B" };
const RAILED_BELT_RAIL_TOP_COLORS = { light: "#EF4444", mid: "#B91C1C", dark: "#7F1D1D" };
const RAILED_BELT_RAIL_STROKE = "#3F0707";
const RAILED_BELT_CHEVRON_COLORS = { fill: "#EF4444", stroke: "#7F1D1D" };
const railDrawOpts = { railColors: RAILED_BELT_RAIL_COLORS, railTopColors: RAILED_BELT_RAIL_TOP_COLORS, railStroke: RAILED_BELT_RAIL_STROKE, chevronColors: RAILED_BELT_CHEVRON_COLORS };
const beltDrawByTurn = { straight: createConveyorDraw(), left: createConveyorDraw({ turnDirection: "left" }), right: createConveyorDraw({ turnDirection: "right" }) };
const beltRailsDrawByTurn = {
    straight: createConveyorDraw(railDrawOpts),
    left: createConveyorDraw({ turnDirection: "left", ...railDrawOpts }),
    right: createConveyorDraw({ turnDirection: "right", ...railDrawOpts }),
};
const sForcefieldScratch = new Float32Array(8);
const floorBeltStampProxyProto = {
    ageMs: 0,
    getCustomSpriteCacheKey() {
        return `k${this._gridStamp.kind}`;
    },
};
const passagePowerStampProxyProto = {
    facing: 0,
    getCustomSpriteCacheKey() {
        return this._powerSource.energized ? "on" : "off";
    },
};
const forcefieldEdgeStampProxyProto = {
    getCustomSpriteCacheKey() {
        const { mode, allowedSide, powered } = this._forcefield;
        return `${this._edgeKey}_${mode}_${powered ? 1 : 0}_${allowedSide}`;
    },
};
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
/** @type {import("../Canvas/QuantizedSpriteCache.js").PropDrawRecipe} */
const forcefieldEdgeDraw = (ctx, prop, viewport) => {
    const { mode, powered, tripped, allowedSide } = prop._forcefield;
    const l1x = prop._l1x;
    const l1y = prop._l1y;
    const l2x = prop._l2x;
    const l2y = prop._l2y;
    const lineScale = getCanvasLineScale(ctx);
    projectPropVertexScalarsInto(sForcefieldScratch, 0, prop, viewport, l1x, l1y, 0);
    const p1BaseX = sForcefieldScratch[0],
        p1BaseY = sForcefieldScratch[1];
    projectPropVertexScalarsInto(sForcefieldScratch, 0, prop, viewport, l1x, l1y, FORCEFIELD_HEIGHT);
    const p1TopX = sForcefieldScratch[0],
        p1TopY = sForcefieldScratch[1];
    projectPropVertexScalarsInto(sForcefieldScratch, 0, prop, viewport, l2x, l2y, 0);
    const p2BaseX = sForcefieldScratch[0],
        p2BaseY = sForcefieldScratch[1];
    projectPropVertexScalarsInto(sForcefieldScratch, 0, prop, viewport, l2x, l2y, FORCEFIELD_HEIGHT);
    const p2TopX = sForcefieldScratch[0],
        p2TopY = sForcefieldScratch[1];
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
            const sideDot = (viewport.x - prop.x) * ax + (viewport.y - prop.y) * ay;
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
        ctx.moveTo(p1BaseX, p1BaseY);
        ctx.lineTo(p2BaseX, p2BaseY);
        ctx.lineTo(p2TopX, p2TopY);
        ctx.lineTo(p1TopX, p1TopY);
        ctx.closePath();
        ctx.fill();
        for (const h of [2.0, 5.0, 8.0]) {
            projectPropVertexScalarsInto(sForcefieldScratch, 0, prop, viewport, l1x, l1y, h);
            const beamStartX = sForcefieldScratch[0],
                beamStartY = sForcefieldScratch[1];
            projectPropVertexScalarsInto(sForcefieldScratch, 0, prop, viewport, l2x, l2y, h);
            const beamEndX = sForcefieldScratch[0],
                beamEndY = sForcefieldScratch[1];
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 3.5 * lineScale;
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.moveTo(beamStartX, beamStartY);
            ctx.lineTo(beamEndX, beamEndY);
            ctx.stroke();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.0 * lineScale;
            ctx.globalAlpha = 1.0;
            ctx.beginPath();
            ctx.moveTo(beamStartX, beamStartY);
            ctx.lineTo(beamEndX, beamEndY);
            ctx.stroke();
        }
    } else {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
        ctx.lineWidth = 1.2 * lineScale;
        ctx.setLineDash([4 * lineScale, 5 * lineScale]);
        for (const h of [2.0, 5.0, 8.0]) {
            projectPropVertexScalarsInto(sForcefieldScratch, 0, prop, viewport, l1x, l1y, h);
            const beamStartX = sForcefieldScratch[0],
                beamStartY = sForcefieldScratch[1];
            projectPropVertexScalarsInto(sForcefieldScratch, 0, prop, viewport, l2x, l2y, h);
            const beamEndX = sForcefieldScratch[0],
                beamEndY = sForcefieldScratch[1];
            ctx.beginPath();
            ctx.moveTo(beamStartX, beamStartY);
            ctx.lineTo(beamEndX, beamEndY);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }
    ctx.strokeStyle = powered ? "#475569" : "#334155";
    ctx.lineWidth = 2.5 * lineScale;
    ctx.beginPath();
    ctx.moveTo(p1BaseX, p1BaseY);
    ctx.lineTo(p1TopX, p1TopY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p2BaseX, p2BaseY);
    ctx.lineTo(p2TopX, p2TopY);
    ctx.stroke();
    ctx.fillStyle = powered ? "#64748b" : "#475569";
    ctx.beginPath();
    ctx.arc(p1TopX, p1TopY, 1.8 * lineScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p2TopX, p2TopY, 1.8 * lineScale, 0, Math.PI * 2);
    ctx.fill();
    if (mode === PASSAGE_MODE.OneWay) {
        const { x: ax, y: ay } = gridSideOutwardVector(allowedSide);
        projectPropVertexScalarsInto(sForcefieldScratch, 0, prop, viewport, 0, 0, 5.0);
        const arrowCenterX = sForcefieldScratch[0],
            arrowCenterY = sForcefieldScratch[1];
        drawDirectionalArrow(ctx, arrowCenterX, arrowCenterY, ax, ay, 6 * lineScale, powered ? "rgba(255, 255, 255, 0.95)" : "rgba(255, 255, 255, 0.45)");
    }
    ctx.restore();
};
const passagePowerSourceDraw = (ctx, prop) => {
    const energized = prop._powerSource.energized;
    const cellSize = prop.halfExtents.x * 2;
    const inset = cellSize * 0.22;
    const lineScale = getCanvasLineScale(ctx);
    const half = cellSize * 0.5;
    const left = prop.x - half + inset;
    const top = prop.y - half + inset;
    const size = cellSize - inset * 2;
    ctx.fillStyle = energized ? "rgba(255, 193, 7, 0.35)" : "rgba(120, 53, 15, 0.25)";
    ctx.strokeStyle = energized ? "#FFC107" : "#FF8F00";
    ctx.lineWidth = (energized ? 2.5 : 1.5) * lineScale;
    ctx.beginPath();
    ctx.rect(left, top, size, size);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = energized ? "#FFE082" : "#FFB300";
    fillCircle(ctx, prop.x, prop.y, (energized ? 5 : 4) * lineScale);
    const corner = inset * 0.55;
    const innerHalf = half - inset;
    ctx.fillStyle = energized ? "#FFF59D" : "#FFCA28";
    fillCircle(ctx, prop.x - innerHalf, prop.y - innerHalf, corner * lineScale);
    fillCircle(ctx, prop.x + innerHalf, prop.y - innerHalf, corner * lineScale);
    fillCircle(ctx, prop.x + innerHalf, prop.y + innerHalf, corner * lineScale);
    fillCircle(ctx, prop.x - innerHalf, prop.y + innerHalf, corner * lineScale);
};
function beltDrawForKind(kind) {
    const turn = floorBeltElbowTurn(kind);
    const table = isFloorBeltRailsKind(kind) ? beltRailsDrawByTurn : beltDrawByTurn;
    if (turn === "left") return table.left;
    if (turn === "right") return table.right;
    return table.straight;
}
function createGridCellStampProxy(proto, x, y, cellHalf, init) {
    const proxy = Object.create(proto);
    proxy.x = x;
    proxy.y = y;
    proxy.radius = cellHalf;
    proxy.halfExtents = SHARED_HALF_EXTENTS;
    init(proxy);
    return proxy;
}
function gridCellCenterWorld(grid, col, row) {
    return { x: grid.gridCenterX(col), y: grid.gridCenterY(row) };
}
function createFloorBeltStampProxy(x, y, facing, cellHalf, kind) {
    return createGridCellStampProxy(floorBeltStampProxyProto, x, y, cellHalf, (proxy) => {
        proxy.facing = facing;
        proxy._gridStamp = { kind };
    });
}
function createPassagePowerStampProxy(x, y, cellHalf) {
    return createGridCellStampProxy(passagePowerStampProxyProto, x, y, cellHalf, (proxy) => {
        proxy._powerSource = { energized: false };
    });
}
function createForcefieldEdgeStampProxy(midX, midY, side, cellHalf, edgeKey, { mode, allowedSide, powered }) {
    return createGridCellStampProxy(forcefieldEdgeStampProxyProto, midX, midY, cellHalf, (proxy) => {
        proxy.facing = gridEdgeSideFacing(side);
        proxy._edgeKey = edgeKey;
        proxy._forcefield = { mode, allowedSide, powered, tripped: false };
        proxy._l1x = EDGE_P1.x - midX;
        proxy._l1y = EDGE_P1.y - midY;
        proxy._l2x = EDGE_P2.x - midX;
        proxy._l2y = EDGE_P2.y - midY;
    });
}
export function syncPassageEdgeStampDrawCache(state, grid) {
    if (!state.sandbox) return null;
    const revision = passageEdgeDrawCacheKey(grid);
    const cached = state.sandbox._passageEdgeDrawCache;
    if (cached?.revision === revision) return cached;
    const cellHalf = grid.cellHalfSize;
    SHARED_HALF_EXTENTS.x = cellHalf;
    SHARED_HALF_EXTENTS.y = cellHalf;
    const edges = [];
    forEachCellEdge(
        grid,
        (col, row, side, edge) => {
            cellEdgeEndpoints(grid, col, row, side, EDGE_P1, EDGE_P2, 0);
            const midX = (EDGE_P1.x + EDGE_P2.x) * 0.5;
            const midY = (EDGE_P1.y + EDGE_P2.y) * 0.5;
            const { mode, allowedSide, powered } = resolvePassageEdge(edge, side);
            const edgeKey = canonicalEdgeCellKey(grid, col, row, side);
            edges.push({ proxy: createForcefieldEdgeStampProxy(midX, midY, side, cellHalf, edgeKey, { mode, allowedSide, powered }), edgeKey, midX, midY });
        },
        { canonicalOnly: true, filter: isForcefieldEdge },
    );
    const next = { revision, edges };
    state.sandbox._passageEdgeDrawCache = next;
    return next;
}
export function collectForcefieldEdgeDrawables(grid, gameState, viewport, outQueue) {
    if (!grid.cols || !grid.edgeStore.passageEdgeCount || !gameState.sandbox) return;
    const cached = syncPassageEdgeStampDrawCache(gameState, grid);
    if (!cached?.edges.length) return;
    const tripwireTriggered = gameState.sandbox.tripwireTriggeredKeys;
    const edges = cached.edges;
    for (let i = 0; i < edges.length; i++) {
        const item = edges[i];
        if (!viewport.circleInBounds(item.midX, item.midY, item.proxy.radius, "props")) continue;
        const tripped = item.proxy._forcefield.powered && tripwireTriggered.has(item.edgeKey);
        if (tripped !== item.proxy._forcefield.tripped) item.proxy._forcefield.tripped = tripped;
        item.proxy._distSq = (item.midX - viewport.x) ** 2 + (item.midY - viewport.y) ** 2;
        outQueue.push(DRAW_KIND_FORCEFIELD, 0, item.proxy, item.proxy._distSq);
    }
}
export function drawForcefieldEdgeProp(ctx, proxy, viewport) {
    drawCachedPropSprite(ctx, proxy, viewport, GRID_STAMP_RENDER_KEY.ForcefieldEdge, forcefieldEdgeDraw);
}
export function clearGridStampDrawCaches(state) {
    if (!state.sandbox) return;
    state.sandbox._floorOccupancyStampDrawCache = null;
    state.sandbox._passageEdgeDrawCache = null;
}
export function syncFloorOccupancyStampDrawCache(state, grid) {
    if (!state.sandbox) return null;
    const revision = floorOccupancyStampDrawCacheKey(grid);
    const cached = state.sandbox._floorOccupancyStampDrawCache;
    if (cached?.revision === revision) return cached;
    const cellHalf = grid.cellHalfSize;
    SHARED_HALF_EXTENTS.x = cellHalf;
    SHARED_HALF_EXTENTS.y = cellHalf;
    const belts = [];
    const powerSources = [];
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        const kind = grid.floorStore.kind[idx];
        if (!grid.floorStore.hasAnyAtIdx(idx)) continue;
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        const { x, y } = gridCellCenterWorld(grid, col, row);
        if (isFloorBeltKind(kind)) {
            belts.push({ proxy: createFloorBeltStampProxy(x, y, floorBeltFacingFromIndex(grid.floorStore.facing[idx]), cellHalf, kind), x, y });
            continue;
        }
        if (grid.floorStore.isPassagePowerSourceAtIdx(idx)) powerSources.push({ proxy: createPassagePowerStampProxy(x, y, cellHalf), col, row, x, y });
    }
    const next = { revision, belts, powerSources };
    state.sandbox._floorOccupancyStampDrawCache = next;
    return next;
}
function drawCachedFloorOccupancyBelts(ctx, viewport, gameTime, cached) {
    const animFrame = Math.floor(gameTime / 60) % 8;
    const belts = cached.belts;
    for (let i = 0; i < belts.length; i++) {
        const item = belts[i];
        if (!viewport.circleInBounds(item.x, item.y, item.proxy.radius, "props")) continue;
        item.proxy.ageMs = gameTime;
        drawCachedPropSprite(ctx, item.proxy, viewport, GRID_STAMP_RENDER_KEY.FloorBelt, beltDrawForKind(item.proxy._gridStamp.kind), animFrame);
    }
}
function drawCachedFloorOccupancyPowerSources(ctx, viewport, cached, state) {
    const powerSources = cached.powerSources;
    for (let i = 0; i < powerSources.length; i++) {
        const item = powerSources[i];
        if (!viewport.circleInBounds(item.x, item.y, item.proxy.radius, "props")) continue;
        item.proxy._powerSource.energized = isPassagePowerSourceEnergized(state, item.col, item.row);
        drawCachedPropSprite(ctx, item.proxy, viewport, GRID_STAMP_RENDER_KEY.PassagePowerSource, passagePowerSourceDraw);
    }
}
export function drawFloorOccupancyBelts(ctx, state, viewport) {
    const grid = state.obstacleGrid;
    if (!grid.floorStore.hasAny()) return;
    const cached = syncFloorOccupancyStampDrawCache(state, grid);
    if (!cached?.belts.length) return;
    drawCachedFloorOccupancyBelts(ctx, viewport, state.gameTime, cached);
}
export function drawFloorOccupancyPowerSources(ctx, state, viewport) {
    const grid = state.obstacleGrid;
    if (!grid.cols) return;
    const cached = syncFloorOccupancyStampDrawCache(state, grid);
    if (!cached?.powerSources.length) return;
    drawCachedFloorOccupancyPowerSources(ctx, viewport, cached, state);
}
