import { CircleShape, PolygonShape } from "../collision/Shapes.js";
import { satCheckCollision, entityFacing } from "../collision/SatCollision.js";
import { centerHalfExtentsAabbInto, createAabb } from "../../Math/Aabb2D.js";
import { boxLocalFootprint, convexFootprintHalfExtents, vertCount } from "../../Math/Poly2D.js";
import { neighborQueryPadFor } from "../collision/entityBroadphase.js";
import { stepCardinalFacing } from "../../Math/Angle.js";
import { findLiveWorldProp } from "../../../GameState/EntityRegistry.js";
export function processFloorShapes(spatialFrame, shapes, { onEnter, onExit }) {
    if (!shapes.length) return;
    for (let z = 0; z < shapes.length; z++) {
        const floorShape = shapes[z];
        const candidates = spatialFrame.collectEntitiesInBounds(floorShape.aabb);
        const next = floorShape._nextOccupants;
        next.clear();
        const zoneShape = floorShape.shape;
        for (let i = 0; i < candidates.length; i++) {
            const entity = candidates[i];
            if (!entity || entity.isDead) continue;
            const shape = entity.shape;
            if (!satCheckCollision(entity.x, entity.y, entityFacing(entity), shape, floorShape.x, floorShape.y, entityFacing(floorShape), zoneShape)) continue;
            next.add(entity.id);
            if (!floorShape._occupants.has(entity.id)) onEnter(floorShape, entity);
        }
        for (const id of floorShape._occupants) if (!next.has(id)) onExit(floorShape, id);
        const prev = floorShape._occupants;
        floorShape._occupants = next;
        floorShape._nextOccupants = prev;
    }
}
export function syncFloorPropCollisionShape(prop) {
    const footprint = prop.strategy.localFootprint;
    if (footprint && vertCount(footprint) >= 3) prop.shape = new PolygonShape(footprint);
    else {
        const radius = prop.radius ?? prop.strategy.radius ?? 0;
        prop.shape = new CircleShape(radius);
    }
    prop.radius = prop.shape.getBoundingRadius();
}
export function syncFloorTriggerAabb(prop) {
    const shape = prop.shape;
    if (shape.type === "Polygon") {
        const span = convexFootprintHalfExtents(shape.vertices);
        centerHalfExtentsAabbInto(prop.aabb, prop.x, prop.y, span.x, span.y, neighborQueryPadFor(prop));
        return;
    }
    const radius = shape.radius ?? prop.radius;
    centerHalfExtentsAabbInto(prop.aabb, prop.x, prop.y, radius, radius, neighborQueryPadFor(prop));
}
export function floorCircleRadius(prop) {
    return prop.shape?.radius ?? prop.radius;
}
export function readFloorPropHalfExtents(prop) {
    const shape = prop.shape;
    if (shape.type === "Polygon") {
        const span = convexFootprintHalfExtents(shape.vertices);
        return { halfWidth: span.x, halfHeight: span.y };
    }
    if (shape.type === "Circle") return { halfWidth: shape.radius, halfHeight: shape.radius };
    throw new Error("readFloorPropHalfExtents requires a circle or polygon shape");
}
export function floorShapeHasLiveOccupant(registry, floorShape) {
    for (const entityId of floorShape._occupants) {
        const entity = registry.get(entityId);
        if (entity && !entity.isDead) return true;
    }
    return false;
}
export function initFloorTriggerProp(prop) {
    prop._occupants = new Set();
    prop._nextOccupants = new Set();
    prop.triggers = prop.strategy.floorTriggers.map((trigger) => ({ ...trigger }));
    prop.powered = prop.strategy.powered !== false;
    prop.aabb = createAabb();
    syncFloorPropCollisionShape(prop);
    syncFloorTriggerAabb(prop);
}
export function resizeFloorPropHalfExtents(prop, halfWidth, halfHeight) {
    prop.shape = new PolygonShape(boxLocalFootprint(halfWidth, halfHeight));
    prop.radius = prop.shape.getBoundingRadius();
    syncFloorTriggerAabb(prop);
}
export function obstacleGridCellHalfExtents(obstacleGrid) {
    const half = obstacleGrid.cellHalfSize;
    return { halfWidth: half, halfHeight: half };
}
export function anchorFloorPropToObstacleGrid(prop, obstacleGrid, worldX, worldY) {
    const col = obstacleGrid.worldCol(worldX);
    const row = obstacleGrid.worldRow(worldY);
    prop.gridCol = col;
    prop.gridRow = row;
    prop.x = obstacleGrid.gridCenterX(col);
    prop.y = obstacleGrid.gridCenterY(row);
    const { halfWidth, halfHeight } = obstacleGridCellHalfExtents(obstacleGrid);
    resizeFloorPropHalfExtents(prop, halfWidth, halfHeight);
}
export function rotateCardinalFloorProp(prop, steps = 1) {
    prop.facing = stepCardinalFacing(prop.facing ?? 0, steps);
}
export function findGridAnchoredFloorPropAtCell(worldProps, col, row, exceptPropId = -1) {
    return findLiveWorldProp(worldProps, (prop) => prop.strategy?.gridAnchored && prop.id !== exceptPropId && prop.gridCol === col && prop.gridRow === row);
}
