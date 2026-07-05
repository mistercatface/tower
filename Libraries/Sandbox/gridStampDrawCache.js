import { drawCachedPropSprite, GRID_STAMP_RENDER_KEY } from "../Canvas/QuantizedSpriteCache.js";
import {  FloorBelt  } from "../Spatial/spatial.js";
import {  floorOccupancyStampDrawCacheKey  } from "../Spatial/spatial.js";
import { createConveyorDraw } from "../Render/conveyorDraw.js";
const SHARED_HALF_EXTENTS = { x: 0, y: 0 };
const beltDrawByTurn = { straight: createConveyorDraw(), left: createConveyorDraw({ turnDirection: "left" }), right: createConveyorDraw({ turnDirection: "right" }) };
function beltDrawForKind(kind) {
    const turn = FloorBelt.getElbowTurn(kind);
    if (turn === "left") return beltDrawByTurn.left;
    if (turn === "right") return beltDrawByTurn.right;
    return beltDrawByTurn.straight;
}
const floorBeltStampProxyProto = {
    ageMs: 0,
    getCustomSpriteCacheKey() {
        return `k${this.beltKind}`;
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
function createFloorBeltStampProxy(x, y, facing, cellHalf, kind) {
    return createGridCellStampProxy(floorBeltStampProxyProto, x, y, cellHalf, (proxy) => {
        proxy.facing = facing;
        proxy.beltKind = kind;
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
        const { x, y } = grid.gridToWorldByIdx(idx);
        if (FloorBelt.isBelt(kind)) belts.push({ proxy: createFloorBeltStampProxy(x, y, FloorBelt.getFacingAngle(grid.floorStore.facing[idx]), cellHalf, kind), x, y });
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
        drawCachedPropSprite(ctx, item.proxy, viewport, GRID_STAMP_RENDER_KEY.FloorBelt, beltDrawForKind(item.proxy.beltKind), animFrame);
    }
}
export function drawFloorOccupancyBelts(ctx, state, viewport) {
    const grid = state.obstacleGrid;
    if (!grid.floorStore.hasAny()) return;
    const cached = syncFloorOccupancyStampDrawCache(state, grid);
    if (!cached?.belts.length) return;
    drawCachedFloorOccupancyBelts(ctx, viewport, state.gameTime, cached);
}
