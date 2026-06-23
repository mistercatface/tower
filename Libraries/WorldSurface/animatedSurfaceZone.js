import { requestUiUpdate } from "../../Core/EventSystem.js";
import { bakeAnimatedSurfaceFlipbook, releaseAnimatedSurfaceFlipbook } from "./animatedSurfaceFlipbook.js";
import { createAnimatedSurfaceZone, disposeAnimatedSurfaceZone } from "./animatedSurfaceDraw.js";
/**
 * Register a zone and start an eager flipbook bake. Resolves when `zone.flipbook` is ready
 * (or silently skips if the zone was disposed while baking).
 *
 * @param {ReturnType<typeof createAnimatedSurfaceZone>[]} zones
 * @param {ReturnType<typeof createAnimatedSurfaceZone>} zone
 * @param {number} seed
 */
export function pushAnimatedSurfaceZone(zones, zone, seed) {
    zones.push(zone);
    const bakeGeneration = ++zone.bakeGeneration;
    void bakeAnimatedSurfaceFlipbook({ play: zone.play, bounds: zone.bounds, railHeight: zone.railHeight, profileId: zone.profileId, surfaceAnimation: zone.surfaceAnimation, seed }).then(
        (flipbook) => {
            if (zone.bakeGeneration !== bakeGeneration) {
                releaseAnimatedSurfaceFlipbook(flipbook);
                return;
            }
            zone.flipbook = flipbook;
            requestUiUpdate();
        },
    );
    return zone;
}
/** @param {ReturnType<typeof createAnimatedSurfaceZone>[]} zones @param {string} zoneId */
export function removeAnimatedSurfaceZoneById(zones, zoneId) {
    for (let i = zones.length - 1; i >= 0; i--) {
        if (zones[i].id !== zoneId) continue;
        disposeAnimatedSurfaceZone(zones[i]);
        zones.splice(i, 1);
        return;
    }
}
/** @param {ReturnType<typeof createAnimatedSurfaceZone>[]} zones */
export function clearAnimatedSurfaceZones(zones) {
    for (let i = zones.length - 1; i >= 0; i--) disposeAnimatedSurfaceZone(zones[i]);
    zones.length = 0;
}
