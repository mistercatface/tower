import { SatCollision } from "../collision/SatCollision.js";
/** @typedef {import("./groundZone.js").ReturnType<typeof import("./groundZone.js").createRectGroundZone>} GroundZone */
/** @typedef {import("../world/SpatialFrameCore.js").SpatialFrameCore} SpatialFrameCore */
function isGroundZoneCandidate(entity) {
    if (!entity || entity.isDead) return false;
    if (entity.elevation != null && entity.elevation < -6) return false;
    return typeof entity.getShape === "function";
}
function entityOverlapsZone(entity, zone) {
    const shape = entity.getShape();
    if (!shape) return false;
    return SatCollision.checkCollision(entity, shape, zone, zone.shape) != null;
}
/**
 * Per-zone broadphase via spatial frame grid — never scans `state.pickups`.
 *
 * @param {SpatialFrameCore} spatialFrame
 * @param {GroundZone[]} zones
 * @param {{ onEnter?: (zone: GroundZone, entity: object) => void, onExit?: (zone: GroundZone, entityId: number) => void }} [handlers]
 */
export function processGroundZones(spatialFrame, zones, { onEnter, onExit } = {}) {
    if (!spatialFrame || !zones?.length) return;
    const handleEnter = onEnter ?? ((zone, entity) => console.log(`[groundZone] enter ${zone.id} entity#${entity.id} (${entity.type})`));
    const handleExit = onExit ?? ((zone, entityId) => console.log(`[groundZone] exit ${zone.id} entity#${entityId}`));
    for (let z = 0; z < zones.length; z++) {
        const zone = zones[z];
        const { minX, minY, maxX, maxY } = zone.aabb;
        const candidates = spatialFrame.collectEntitiesInBounds(minX, minY, maxX, maxY);
        const next = zone._nextOccupants;
        next.clear();
        for (let i = 0; i < candidates.length; i++) {
            const entity = candidates[i];
            if (!isGroundZoneCandidate(entity)) continue;
            if (!entityOverlapsZone(entity, zone)) continue;
            next.add(entity.id);
            if (!zone._occupants.has(entity.id)) handleEnter(zone, entity);
        }
        for (const id of zone._occupants) if (!next.has(id)) handleExit(zone, id);
        const prev = zone._occupants;
        zone._occupants = next;
        zone._nextOccupants = prev;
    }
}
