import { CircleShape, PolygonShape } from "../collision/Shapes.js";
import { SatCollision } from "../collision/SatCollision.js";
import { aabbOverlap, centerHalfExtentsAabbInto, createAabb } from "../../Math/Aabb2D.js";
import { fillStrokeCircle, fillStrokeClosedPolygonTranslated } from "../../Canvas/CanvasPath.js";
import { NEIGHBOR_QUERY_PAD } from "../collision/entityBroadphase.js";
/** @typedef {import("../../Math/Aabb2D.js").Aabb2D} Aabb2D */
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
        centerHalfExtentsAabbInto(createAabb(), x, y, halfWidth, halfHeight),
        { id },
    );
}
/** @param {number} x @param {number} y @param {number} radius @param {{ id?: string }} [options] */
export function createCircleFloorShape(x, y, radius, { id = "floor-shape" } = {}) {
    return createFloorShape(x, y, new CircleShape(radius), centerHalfExtentsAabbInto(createAabb(), x, y, radius, radius), { id });
}
/**
 * Track which entities overlap flat floor shapes (circle or rect polygon).
 *
 * @param {import("../world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame
 * @param {ReturnType<typeof createRectFloorShape>[]} shapes
 * @param {{ onEnter: (shape: object, entity: object) => void, onExit: (shape: object, entityId: number) => void }} handlers
 */
export function processFloorShapes(spatialFrame, shapes, { onEnter, onExit }) {
    if (!shapes.length) return;
    for (let z = 0; z < shapes.length; z++) {
        const floorShape = shapes[z];
        const candidates = spatialFrame.collectEntitiesInBounds(floorShape.aabb);
        const next = floorShape._nextOccupants;
        next.clear();
        for (let i = 0; i < candidates.length; i++) {
            const entity = candidates[i];
            if (!entity || entity.isDead) continue;
            const shape = entity.getShape();
            if (SatCollision.checkCollision(entity, shape, floorShape, floorShape.shape) == null) continue;
            next.add(entity.id);
            if (!floorShape._occupants.has(entity.id)) onEnter(floorShape, entity);
        }
        for (const id of floorShape._occupants) if (!next.has(id)) onExit(floorShape, id);
        const prev = floorShape._occupants;
        floorShape._occupants = next;
        floorShape._nextOccupants = prev;
    }
}
/** @param {object} prop */
export function syncFloorTriggerAabb(prop) {
    if (prop.halfExtents) centerHalfExtentsAabbInto(prop.aabb, prop.x, prop.y, prop.halfExtents.x, prop.halfExtents.y, NEIGHBOR_QUERY_PAD);
    else centerHalfExtentsAabbInto(prop.aabb, prop.x, prop.y, prop.radius, prop.radius, NEIGHBOR_QUERY_PAD);
}
/** @param {object} prop */
export function initFloorTriggerProp(prop) {
    prop._occupants = new Set();
    prop._nextOccupants = new Set();
    prop.triggers = prop.strategy.floorTriggers.map((trigger) => ({ ...trigger }));
    if (prop.strategy.sinkDepth != null) prop.sinkDepth = prop.strategy.sinkDepth;
    if (prop.strategy.captureTolerance != null) prop.captureTolerance = prop.strategy.captureTolerance;
    if (prop.strategy.wallMode === true) {
        prop.wallMode = true;
        prop.walls = [];
        prop.wallsUp = false;
    }
    prop.powered = prop.strategy.powered !== false;
    prop.aabb = createAabb();
    syncFloorTriggerAabb(prop);
}
/** @param {object} prop @param {number} halfWidth @param {number} halfHeight */
export function resizeFloorPropHalfExtents(prop, halfWidth, halfHeight) {
    prop.halfExtents = { x: halfWidth, y: halfHeight };
    prop.radius = Math.max(halfWidth, halfHeight);
    prop.shape = new PolygonShape([
        { x: -halfWidth, y: -halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: halfWidth, y: halfHeight },
        { x: -halfWidth, y: halfHeight },
    ]);
    syncFloorTriggerAabb(prop);
}
/** @param {{ shape: { type: string, vertices?: { x: number, y: number }[] } }} pad @param {{ halfWidth: number, halfHeight: number }} [defaults] */
export function readRectPadHalfExtents(pad, defaults) {
    if (pad.shape.type === "Polygon") {
        const v = pad.shape.vertices[0];
        return { halfWidth: Math.abs(v.x), halfHeight: Math.abs(v.y) };
    }
    if (defaults) return { halfWidth: defaults.halfWidth, halfHeight: defaults.halfHeight };
    throw new Error("readRectPadHalfExtents requires defaults for non-polygon pads");
}
/** @param {object} pad @param {number} halfWidth @param {number} halfHeight @param {number} [queryPad] */
export function syncPadQueryAabb(pad, halfWidth, halfHeight, queryPad = NEIGHBOR_QUERY_PAD) {
    if (!pad.aabb) pad.aabb = createAabb();
    centerHalfExtentsAabbInto(pad.aabb, pad.x, pad.y, halfWidth, halfHeight, queryPad);
}
/** @param {object} pad @param {number} halfWidth @param {number} halfHeight @param {number} [queryPad] @returns {Aabb2D} */
export function padStampBoundsInto(out, pad, halfWidth, halfHeight, queryPad = 0) {
    return centerHalfExtentsAabbInto(out, pad.x, pad.y, halfWidth, halfHeight, queryPad);
}
/** @param {{ aabb: Aabb2D }} entity @param {import("../../Viewport/Viewport.js").Viewport} viewport */
export function isAabbInView(entity, viewport) {
    return aabbOverlap(entity.aabb, viewport.boundsClip);
}
/** @param {CanvasRenderingContext2D} ctx @param {ReturnType<typeof createRectFloorShape>} floorShape */
export function drawFloorShape(ctx, floorShape, { fill = "rgba(120, 200, 255, 0.18)", stroke = "rgba(120, 200, 255, 0.65)", lineWidth = 2 } = {}) {
    const shape = floorShape.shape;
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    if (shape.type === "Circle") fillStrokeCircle(ctx, floorShape.x, floorShape.y, shape.radius);
    else fillStrokeClosedPolygonTranslated(ctx, floorShape.x, floorShape.y, shape.vertices);
}
