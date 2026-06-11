import { CircleShape, PolygonShape } from "../collision/Shapes.js";
import { SatCollision } from "../collision/SatCollision.js";
function createFloorShape(x, y, shape, aabb, { id = "floor-shape" } = {}) {
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
export function createRectFloorShape(x, y, halfWidth, halfHeight, { id = "floor-shape" } = {}) {
    return createFloorShape(
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
export function createCircleFloorShape(x, y, radius, { id = "floor-shape" } = {}) {
    return createFloorShape(x, y, new CircleShape(radius), { minX: x - radius, minY: y - radius, maxX: x + radius, maxY: y + radius }, { id });
}
/**
 * Track which entities overlap flat floor shapes (circle or rect polygon).
 *
 * @param {import("../world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame
 * @param {ReturnType<typeof createRectFloorShape>[]} shapes
 * @param {{ onEnter: (shape: object, entity: object) => void, onExit: (shape: object, entityId: number) => void }} handlers
 */
export function processFloorShapes(spatialFrame, shapes, { onEnter, onExit }) {
    if (!spatialFrame || !shapes?.length || !onEnter || !onExit) return;
    for (let z = 0; z < shapes.length; z++) {
        const floorShape = shapes[z];
        const { minX, minY, maxX, maxY } = floorShape.aabb;
        const candidates = spatialFrame.collectEntitiesInBounds(minX, minY, maxX, maxY);
        const next = floorShape._nextOccupants;
        next.clear();
        for (let i = 0; i < candidates.length; i++) {
            const entity = candidates[i];
            if (!entity || entity.isDead || !entity.getShape) continue;
            const shape = entity.getShape();
            if (!shape || SatCollision.checkCollision(entity, shape, floorShape, floorShape.shape) == null) continue;
            next.add(entity.id);
            if (!floorShape._occupants.has(entity.id)) onEnter(floorShape, entity);
        }
        for (const id of floorShape._occupants) if (!next.has(id)) onExit(floorShape, id);
        const prev = floorShape._occupants;
        floorShape._occupants = next;
        floorShape._nextOccupants = prev;
    }
}
function aabbOverlap(a, b) {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}
/** @param {{ aabb: { minX: number, minY: number, maxX: number, maxY: number } }} entity @param {import("../../Viewport/Viewport.js").Viewport} viewport */
export function isAabbInView(entity, viewport) {
    return aabbOverlap(entity.aabb, viewport.boundsClip);
}
/** @param {CanvasRenderingContext2D} ctx @param {ReturnType<typeof createRectFloorShape>} floorShape */
export function drawFloorShape(ctx, floorShape, { fill = "rgba(120, 200, 255, 0.18)", stroke = "rgba(120, 200, 255, 0.65)", lineWidth = 2 } = {}) {
    const shape = floorShape.shape;
    ctx.beginPath();
    if (shape.type === "Circle") ctx.arc(floorShape.x, floorShape.y, shape.radius, 0, Math.PI * 2);
    else {
        const verts = shape.vertices;
        ctx.moveTo(floorShape.x + verts[0].x, floorShape.y + verts[0].y);
        for (let i = 1; i < verts.length; i++) ctx.lineTo(floorShape.x + verts[i].x, floorShape.y + verts[i].y);
        ctx.closePath();
    }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}
