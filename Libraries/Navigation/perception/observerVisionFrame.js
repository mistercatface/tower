import { gridNavCacheKey } from "../../Spatial/grid/gridNavEpoch.js";
import { buildVisionCellSet, collectVisibleGridCells, resolveObserverHeading } from "./gridCellVision.js";
export const OBSERVER_VIEW_RADIUS_SCALE = 2;
let visionFullBuildCount = 0;
export function resetVisionFullBuildCount() {
    visionFullBuildCount = 0;
}
export function getVisionFullBuildCount() {
    return visionFullBuildCount;
}
function observerVisionPoseKey(observer, navTopology, visionRange) {
    const grid = navTopology.grid;
    const col = grid.worldCol(observer.x);
    const row = grid.worldRow(observer.y);
    return { navKey: gridNavCacheKey(grid), col, row, range: visionRange.range };
}
function observerVisionCacheMatches(cache, key) {
    return cache.navKey === key.navKey && cache.col === key.col && cache.row === key.row && cache.range === key.range;
}
function lookupHeadVisionCache(observer, navTopology, visionRange, { force = false, perceptionTick = null }) {
    if (force) return null;
    const cache = observer._observerVisionCache;
    if (!cache) return null;
    const key = observerVisionPoseKey(observer, navTopology, visionRange);
    if (!observerVisionCacheMatches(cache, key)) return null;
    if (perceptionTick != null && cache.perceptionTick === perceptionTick) return cache;
    return null;
}
function buildHeadVision(observer, navTopology, visionRange, { perceptionTick = null } = {}) {
    const key = observerVisionPoseKey(observer, navTopology, visionRange);
    visionFullBuildCount++;
    const cells = collectVisibleGridCells(navTopology, observer.x, observer.y, visionRange.range);
    const cellSet = buildVisionCellSet(cells, navTopology.grid.cols);
    const next = {
        navKey: key.navKey,
        col: key.col,
        row: key.row,
        originCol: key.col,
        originRow: key.row,
        heading: resolveObserverHeading(observer),
        range: visionRange.range,
        perceptionTick,
        cells,
        cellSet,
    };
    observer._observerVisionCache = next;
    return next;
}
export function createObserverVisionFrame({ tickId, navTopology, visionRange, viewport }) {
    const frame = {
        tickId,
        navTopology,
        visionRange,
        viewport,
        readHeadVision(observer, visionRangeOverride = visionRange) {
            return lookupHeadVisionCache(observer, navTopology, visionRangeOverride, { perceptionTick: frame.tickId });
        },
        ensureHeadVision(observer, visionRangeOverride = visionRange) {
            const cached = lookupHeadVisionCache(observer, navTopology, visionRangeOverride, { perceptionTick: frame.tickId });
            if (cached) return cached;
            return buildHeadVision(observer, navTopology, visionRangeOverride, { perceptionTick: frame.tickId });
        },
    };
    return frame;
}
export function getObserverVisionFrame(state) {
    return state.nav.observerVisionFrame;
}
