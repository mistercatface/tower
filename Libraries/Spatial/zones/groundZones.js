import { PolygonShape } from "../collision/Shapes.js";
import { SatCollision } from "../collision/SatCollision.js";
/**
 * @param {number} x @param {number} y
 * @param {number} halfWidth @param {number} halfHeight
 * @param {{ id?: string }} [options]
 */
export function createRectGroundZone(x, y, halfWidth, halfHeight, { id = "ground-zone" } = {}) {
    const shape = new PolygonShape([
        { x: -halfWidth, y: -halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: halfWidth, y: halfHeight },
        { x: -halfWidth, y: halfHeight },
    ]);
    return {
        id,
        x,
        y,
        facing: 0,
        shape,
        aabb: { minX: x - halfWidth, minY: y - halfHeight, maxX: x + halfWidth, maxY: y + halfHeight },
        getShape() {
            return this.shape;
        },
        _occupants: new Set(),
        _nextOccupants: new Set(),
    };
}
/**
 * Per-zone grid broadphase + SAT + enter/exit. Never scans `state.pickups`.
 *
 * @param {import("../world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame
 * @param {ReturnType<typeof createRectGroundZone>[]} zones
 * @param {{ onEnter?: (zone: object, entity: object) => void, onExit?: (zone: object, entityId: number) => void }} [handlers]
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
            if (!entity || entity.isDead || (entity.elevation != null && entity.elevation < -6) || typeof entity.getShape !== "function") continue;
            const shape = entity.getShape();
            if (!shape || SatCollision.checkCollision(entity, shape, zone, zone.shape) == null) continue;
            next.add(entity.id);
            if (!zone._occupants.has(entity.id)) handleEnter(zone, entity);
        }
        for (const id of zone._occupants) if (!next.has(id)) handleExit(zone, id);
        const prev = zone._occupants;
        zone._occupants = next;
        zone._nextOccupants = prev;
    }
}
