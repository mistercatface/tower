import { CircleShape, PolygonShape } from "../collision/Shapes.js";
import { SatCollision } from "../collision/SatCollision.js";
import { NEIGHBOR_QUERY_PAD } from "../collision/entityBroadphase.js";
function createGroundZone(x, y, shape, aabb, { id = "ground-zone" } = {}) {
    return {
        id,
        x,
        y,
        facing: 0,
        shape,
        aabb,
        getShape() {
            return this.shape;
        },
        _occupants: new Set(),
        _nextOccupants: new Set(),
    };
}
/** @param {number} x @param {number} y @param {number} halfWidth @param {number} halfHeight @param {{ id?: string }} [options] */
export function createRectGroundZone(x, y, halfWidth, halfHeight, { id = "ground-zone" } = {}) {
    return createGroundZone(
        x,
        y,
        new PolygonShape([
            { x: -halfWidth, y: -halfHeight },
            { x: halfWidth, y: -halfHeight },
            { x: halfWidth, y: halfHeight },
            { x: -halfWidth, y: halfHeight },
        ]),
        { minX: x - halfWidth, minY: y - halfHeight, maxX: x + halfWidth, maxY: y + halfHeight },
        { id },
    );
}
/** @param {number} x @param {number} y @param {number} radius @param {{ id?: string }} [options] */
export function createCircleGroundZone(x, y, radius, { id = "ground-zone" } = {}) {
    return createGroundZone(x, y, new CircleShape(radius), { minX: x - radius, minY: y - radius, maxX: x + radius, maxY: y + radius }, { id });
}
/** @param {number} x @param {number} y @param {number} halfWidth @param {number} halfHeight @param {{ forceX?: number, forceY?: number, id?: string }} [options] */
export function createGravityZone(x, y, halfWidth, halfHeight, { forceX = 0, forceY = 1000, id = "gravity-zone" } = {}) {
    const pad = NEIGHBOR_QUERY_PAD;
    const zone = createRectGroundZone(x, y, halfWidth, halfHeight, { id });
    zone.kind = "gravity";
    zone.forceX = forceX;
    zone.forceY = forceY;
    zone.aabb = { minX: x - halfWidth - pad, minY: y - halfHeight - pad, maxX: x + halfWidth + pad, maxY: y + halfHeight + pad };
    return zone;
}
/**
 * Per-zone grid broadphase + SAT + enter/exit. Shape-agnostic — same path for rect and circle.
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
            if (!entity || entity.isDead || !entity.getShape) continue;
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
function aabbOverlap(a, b) {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}
/** Draw cull only — sim tick ignores viewport. @param {import("../../Viewport/Viewport.js").Viewport} viewport */
export function isGroundZoneInView(zone, viewport) {
    return aabbOverlap(zone.aabb, viewport.boundsClip);
}
/** @param {CanvasRenderingContext2D} ctx @param {ReturnType<typeof createRectGroundZone>} zone */
export function drawGroundZone(ctx, zone, { fill = "rgba(120, 200, 255, 0.18)", stroke = "rgba(120, 200, 255, 0.65)", lineWidth = 2 } = {}) {
    const shape = zone.shape;
    ctx.beginPath();
    if (shape.type === "Circle") ctx.arc(zone.x, zone.y, shape.radius, 0, Math.PI * 2);
    else {
        const verts = shape.vertices;
        ctx.moveTo(zone.x + verts[0].x, zone.y + verts[0].y);
        for (let i = 1; i < verts.length; i++) ctx.lineTo(zone.x + verts[i].x, zone.y + verts[i].y);
        ctx.closePath();
    }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}
