import { bucketObserverHeading, collectVisibleGridCells, hasGridCellLineOfSightCached, isWorldPointInVisionCone, resolveObserverHeading } from "./gridCellVision.js";
export const OBSERVER_VIEW_RADIUS_SCALE = 2;
let visionFullBuildCount = 0;
export function resetVisionFullBuildCount() {
    visionFullBuildCount = 0;
}
export function getVisionFullBuildCount() {
    return visionFullBuildCount;
}
function observerVisionPoseKey(observer, navTopology, visionCone) {
    const grid = navTopology.grid;
    const { col, row } = grid.worldToGrid(observer.x, observer.y);
    const heading = resolveObserverHeading(observer);
    return { wallRevision: navTopology.wallRevision, col, row, heading, headingBucket: bucketObserverHeading(heading), halfAngle: visionCone.halfAngle, range: visionCone.range };
}
function observerVisionCacheMatches(cache, key) {
    return (
        cache.wallRevision === key.wallRevision &&
        cache.col === key.col &&
        cache.row === key.row &&
        cache.headingBucket === key.headingBucket &&
        cache.halfAngle === key.halfAngle &&
        cache.range === key.range
    );
}
function lookupHeadVisionCache(observer, navTopology, visionCone, { force = false, perceptionTick = null, onScreen = true, brainSyncOffScreenInterval = 1 }) {
    if (force) return null;
    const cache = observer._observerVisionCache;
    if (!cache) return null;
    const key = observerVisionPoseKey(observer, navTopology, visionCone);
    if (!observerVisionCacheMatches(cache, key)) return null;
    if (perceptionTick != null && cache.perceptionTick === perceptionTick) return cache;
    if (!onScreen && brainSyncOffScreenInterval > 1 && perceptionTick != null && perceptionTick % brainSyncOffScreenInterval !== 0) return cache;
    return null;
}
function buildHeadVision(observer, navTopology, visionCone, visionSession, { perceptionTick = null } = {}) {
    const key = observerVisionPoseKey(observer, navTopology, visionCone);
    visionFullBuildCount++;
    const cells = collectVisibleGridCells(navTopology, observer.x, observer.y, key.heading, visionCone.halfAngle, visionCone.range, visionSession);
    const next = {
        wallRevision: key.wallRevision,
        col: key.col,
        row: key.row,
        originCol: key.col,
        originRow: key.row,
        heading: key.heading,
        headingBucket: key.headingBucket,
        halfAngle: visionCone.halfAngle,
        range: visionCone.range,
        perceptionTick,
        cells,
    };
    observer._observerVisionCache = next;
    return next;
}
function resolveObserverViewportSync(viewport, observer, brainSyncOffScreenInterval) {
    const onScreen = viewport.circleInBounds(observer.x, observer.y, observer.radius * OBSERVER_VIEW_RADIUS_SCALE, "props");
    return { onScreen, brainSyncOffScreenInterval };
}
function headVisionLookupFor(frame, observer) {
    const viewSync = resolveObserverViewportSync(frame.viewport, observer, frame.brainSyncOffScreenInterval);
    return { ...viewSync, perceptionTick: frame.tickId };
}
export function queryGridCellVision(observer, candidates, { halfAngle, range, navTopology, visionSession = null }) {
    const visionCone = { halfAngle, range };
    const vision = buildHeadVision(observer, navTopology, visionCone, visionSession);
    const visible = [];
    const grid = navTopology.grid;
    for (let i = 0; i < candidates.length; i++) {
        const target = candidates[i];
        if (target === observer || target.isDead) continue;
        if (!isWorldPointInVisionCone(observer.x, observer.y, vision.heading, halfAngle, range, target.x, target.y)) continue;
        const { col, row } = grid.worldToGrid(target.x, target.y);
        if (!hasGridCellLineOfSightCached(visionSession, navTopology, vision.originCol, vision.originRow, col, row)) continue;
        visible.push(target);
    }
    return { heading: vision.heading, halfAngle, range, cells: vision.cells, visible };
}
export function createObserverVisionFrame({ tickId, navTopology, visionSession, visionCone, viewport, brainSyncOffScreenInterval }) {
    const frame = {
        tickId,
        navTopology,
        visionSession,
        visionCone,
        viewport,
        brainSyncOffScreenInterval,
        shouldSyncBrain(agent) {
            agent._brainSyncPass = (agent._brainSyncPass ?? 0) + 1;
            const { onScreen } = resolveObserverViewportSync(viewport, agent, brainSyncOffScreenInterval);
            return onScreen || agent._brainSyncPass % brainSyncOffScreenInterval === 0;
        },
        readHeadVision(observer, visionConeOverride = visionCone) {
            return lookupHeadVisionCache(observer, navTopology, visionConeOverride, headVisionLookupFor(frame, observer));
        },
        ensureHeadVision(observer, visionConeOverride = visionCone) {
            const lookup = headVisionLookupFor(frame, observer);
            const cached = lookupHeadVisionCache(observer, navTopology, visionConeOverride, lookup);
            if (cached) return cached;
            return buildHeadVision(observer, navTopology, visionConeOverride, visionSession, { perceptionTick: frame.tickId });
        },
    };
    return frame;
}
export function getObserverVisionFrame(state) {
    return state.nav.observerVisionFrame;
}
