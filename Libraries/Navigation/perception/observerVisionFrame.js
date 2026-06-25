import { gridNavCacheKey } from "../../Spatial/grid/gridNavEpoch.js";
import { buildVisionCellSet, collectVisibleGridCells, isPointVisibleFromHeadVision, resolveObserverHeading } from "./gridCellVision.js";
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
    const next = { navKey: key.navKey, col: key.col, row: key.row, originCol: key.col, originRow: key.row, heading: resolveObserverHeading(observer), range: visionRange.range, perceptionTick, cells };
    observer._observerVisionCache = next;
    return next;
}
function resolveObserverViewportSync(viewport, observer, brainSyncOffScreenInterval) {
    const onScreen = viewport.circleInBounds(observer.x, observer.y, observer.radius * OBSERVER_VIEW_RADIUS_SCALE, "props");
    return { onScreen, brainSyncOffScreenInterval };
}
export function queryGridCellVision(observer, candidates, { range, navTopology }) {
    const visionRange = { range };
    const vision = buildHeadVision(observer, navTopology, visionRange);
    const cellSet = buildVisionCellSet(vision.cells, navTopology.grid.cols);
    const visible = [];
    for (let i = 0; i < candidates.length; i++) {
        const target = candidates[i];
        if (target === observer || target.isDead) continue;
        if (!isPointVisibleFromHeadVision(target.x, target.y, observer.x, observer.y, vision.originCol, vision.originRow, range, cellSet, navTopology)) continue;
        visible.push(target);
    }
    return { heading: vision.heading, range, cells: vision.cells, visible };
}
export function createObserverVisionFrame({ tickId, navTopology, visionRange, viewport, brainSyncOffScreenInterval }) {
    const frame = {
        tickId,
        navTopology,
        visionRange,
        viewport,
        brainSyncOffScreenInterval,
        shouldSyncBrain(agent) {
            agent._brainSyncPass = (agent._brainSyncPass ?? 0) + 1;
            const { onScreen } = resolveObserverViewportSync(viewport, agent, brainSyncOffScreenInterval);
            return onScreen || agent._brainSyncPass % brainSyncOffScreenInterval === 0;
        },
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
