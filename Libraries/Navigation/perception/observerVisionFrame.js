import { ensureObserverGridVision, readObserverGridVision, resolveObserverViewSyncContext } from "./gridCellVision.js";
export function createObserverVisionFrame({ tickId, gridNavContext, visionSession, visionCone, viewport, brainSyncOffScreenInterval }) {
    function cacheOptsFor(observer) {
        const viewSync = resolveObserverViewSyncContext(viewport, observer, brainSyncOffScreenInterval);
        return { ...viewSync, perceptionTick: tickId, brainSyncTick: observer._brainSyncTick ?? 0 };
    }
    return {
        tickId,
        gridNavContext,
        visionSession,
        visionCone,
        viewSyncFor(observer) {
            return resolveObserverViewSyncContext(viewport, observer, brainSyncOffScreenInterval);
        },
        readHeadVision(observer, visionConeOverride = visionCone) {
            return readObserverGridVision(observer, gridNavContext, visionConeOverride, cacheOptsFor(observer));
        },
        ensureHeadVision(observer, visionConeOverride = visionCone) {
            return ensureObserverGridVision(observer, gridNavContext, visionConeOverride, visionSession, cacheOptsFor(observer));
        },
    };
}
export function getObserverVisionFrame(state) {
    return state.navigation.observerVisionFrame;
}
