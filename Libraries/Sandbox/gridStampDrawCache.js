import { drawCachedPropSprite, GRID_STAMP_RENDER_KEY } from "../Canvas/QuantizedSpriteCache.js";
import { floorBeltFacingFromIndex, isFloorBeltKind } from "../Spatial/grid/FloorCell.js";
import { floorOccupancyStampDrawCacheKey, bumpFloorOccupancyStampDrawRevision } from "../Spatial/grid/gridNavEpoch.js";
const SHARED_HALF_EXTENTS = { x: 0, y: 0 };
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
    return { x: grid.minX + col * grid.cellSize + grid.cellHalfSize, y: grid.minY + row * grid.cellSize + grid.cellHalfSize };
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
export function drawCachedFloorOccupancyBelts(ctx, viewport, camera, gameTime, cached, beltDrawForKind) {
    const { px, py } = camera;
    const animFrame = Math.floor(gameTime / 60) % 8;
    const belts = cached.belts;
    for (let i = 0; i < belts.length; i++) {
        const item = belts[i];
        if (!viewport.circleInBounds(item.x, item.y, item.proxy.radius, "props")) continue;
        item.proxy.ageMs = gameTime;
        drawCachedPropSprite(ctx, item.proxy, px, py, GRID_STAMP_RENDER_KEY.FloorBelt, beltDrawForKind(item.proxy._gridStamp.kind), { animFrame });
    }
}
export function drawCachedFloorOccupancyPowerSources(ctx, viewport, camera, cached, isEnergized, draw) {
    const { px, py } = camera;
    const powerSources = cached.powerSources;
    for (let i = 0; i < powerSources.length; i++) {
        const item = powerSources[i];
        if (!viewport.circleInBounds(item.x, item.y, item.proxy.radius, "props")) continue;
        item.proxy._powerSource.energized = isEnergized(item.col, item.row);
        drawCachedPropSprite(ctx, item.proxy, px, py, GRID_STAMP_RENDER_KEY.PassagePowerSource, draw);
    }
}
