import { drawCachedPropSprite, GRID_STAMP_RENDER_KEY } from "../Canvas/QuantizedSpriteCache.js";
import { floorBeltFacingFromIndex, floorBeltElbowTurn, isFloorBeltKind, isFloorBeltRailsKind } from "../Spatial/grid/FloorCell.js";
import { floorOccupancyStampDrawCacheKey } from "../Spatial/grid/gridNavEpoch.js";
import { createConveyorDraw } from "../Render/conveyorDraw.js";
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
function beltDrawForKind(kind) {
    const turn = floorBeltElbowTurn(kind);
    const table = isFloorBeltRailsKind(kind) ? beltRailsDrawByTurn : beltDrawByTurn;
    if (turn === "left") return table.left;
    if (turn === "right") return table.right;
    return table.straight;
}
const floorBeltStampProxyProto = {
    ageMs: 0,
    getCustomSpriteCacheKey() {
        return `k${this._gridStamp.kind}`;
    },
};
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
export function clearGridStampDrawCaches(state) {
    if (!state.sandbox) return;
    state.sandbox._floorOccupancyStampDrawCache = null;
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
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        const kind = grid.floorStore.kind[idx];
        if (!grid.floorStore.hasAnyAtIdx(idx)) continue;
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        const { x, y } = gridCellCenterWorld(grid, col, row);
        if (isFloorBeltKind(kind)) belts.push({ proxy: createFloorBeltStampProxy(x, y, floorBeltFacingFromIndex(grid.floorStore.facing[idx]), cellHalf, kind), x, y });
    }
    const next = { revision, belts };
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
export function drawFloorOccupancyBelts(ctx, state, viewport) {
    const grid = state.obstacleGrid;
    if (!grid.floorStore.hasAny()) return;
    const cached = syncFloorOccupancyStampDrawCache(state, grid);
    if (!cached?.belts.length) return;
    drawCachedFloorOccupancyBelts(ctx, viewport, state.gameTime, cached);
}
