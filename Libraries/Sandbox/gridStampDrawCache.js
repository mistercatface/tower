import { drawCachedPropSprite, GRID_STAMP_RENDER_KEY } from "../Canvas/QuantizedSpriteCache.js";
import { fillCircle } from "../Canvas/CanvasPath.js";
import { floorBeltFacingFromIndex, floorBeltElbowTurn, isFloorBeltKind, isFloorBeltRailsKind } from "../Spatial/grid/FloorCell.js";
import { floorOccupancyStampDrawCacheKey } from "../Spatial/grid/gridNavEpoch.js";
import { getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { createConveyorDraw } from "../Render/conveyorDraw.js";
import { isPassagePowerSourceEnergized } from "./passagePowerNetwork.js";
const SHARED_HALF_EXTENTS = { x: 0, y: 0 };
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
function drawCachedFloorOccupancyBelts(ctx, viewport, px, py, gameTime, cached) {
    const animFrame = Math.floor(gameTime / 60) % 8;
    const belts = cached.belts;
    for (let i = 0; i < belts.length; i++) {
        const item = belts[i];
        if (!viewport.circleInBounds(item.x, item.y, item.proxy.radius, "props")) continue;
        item.proxy.ageMs = gameTime;
        drawCachedPropSprite(ctx, item.proxy, px, py, GRID_STAMP_RENDER_KEY.FloorBelt, beltDrawForKind(item.proxy._gridStamp.kind), animFrame);
    }
}
function drawCachedFloorOccupancyPowerSources(ctx, viewport, px, py, cached, state) {
    const powerSources = cached.powerSources;
    for (let i = 0; i < powerSources.length; i++) {
        const item = powerSources[i];
        if (!viewport.circleInBounds(item.x, item.y, item.proxy.radius, "props")) continue;
        item.proxy._powerSource.energized = isPassagePowerSourceEnergized(state, item.col, item.row);
        drawCachedPropSprite(ctx, item.proxy, px, py, GRID_STAMP_RENDER_KEY.PassagePowerSource, passagePowerSourceDraw);
    }
}
export function drawFloorOccupancyBelts(ctx, state, viewport, px, py) {
    const grid = state.obstacleGrid;
    if (!grid.floorStore.hasAny()) return;
    const cached = syncFloorOccupancyStampDrawCache(state, grid);
    if (!cached?.belts.length) return;
    drawCachedFloorOccupancyBelts(ctx, viewport, px, py, state.gameTime, cached);
}
export function drawFloorOccupancyPowerSources(ctx, state, viewport, px, py) {
    const grid = state.obstacleGrid;
    if (!grid.cols) return;
    const cached = syncFloorOccupancyStampDrawCache(state, grid);
    if (!cached?.powerSources.length) return;
    drawCachedFloorOccupancyPowerSources(ctx, viewport, px, py, cached, state);
}
