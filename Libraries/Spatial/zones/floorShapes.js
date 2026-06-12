import { CircleShape, PolygonShape } from "../collision/Shapes.js";
import { SatCollision } from "../collision/SatCollision.js";
import { aabbOverlap, centerHalfExtentsAabbInto, createAabb } from "../../Math/Aabb2D.js";
import { NEIGHBOR_QUERY_PAD } from "../collision/entityBroadphase.js";
import { quantizeCardinalAngle, stepCardinalFacing } from "../../Math/Angle.js";
import { snapWorldToObstacleCellCenter } from "../grid/GridCoords.js";
import { DEFAULT_BUTTON_INPUT_MODE, DEFAULT_BUTTON_MASS_THRESHOLD } from "../../Sandbox/buttonInput.js";
/** @typedef {import("../../Math/Aabb2D.js").Aabb2D} Aabb2D */
/**
 * Track which entities overlap flat floor props (circle or rect polygon).
 *
 * @param {import("../world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame
 * @param {object[]} shapes
 * @param {{ onEnter: (shape: object, entity: object) => void, onExit: (shape: object, entityId: number) => void }} handlers
 */
export function processFloorShapes(spatialFrame, shapes, { onEnter, onExit }) {
    if (!shapes.length) return;
    for (let z = 0; z < shapes.length; z++) {
        const floorShape = shapes[z];
        const candidates = spatialFrame.collectEntitiesInBounds(floorShape.aabb);
        const next = floorShape._nextOccupants;
        next.clear();
        const zoneShape = floorShape.getShape ? floorShape.getShape() : floorShape.shape;
        for (let i = 0; i < candidates.length; i++) {
            const entity = candidates[i];
            if (!entity || entity.isDead) continue;
            const shape = entity.getShape();
            if (SatCollision.checkCollision(entity, shape, floorShape, zoneShape) == null) continue;
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
export function syncFloorPropCollisionShape(prop) {
    if (prop.halfExtents) {
        const hx = prop.halfExtents.x;
        const hy = prop.halfExtents.y;
        prop.shape = new PolygonShape([
            { x: -hx, y: -hy },
            { x: hx, y: -hy },
            { x: hx, y: hy },
            { x: -hx, y: hy },
        ]);
        return;
    }
    prop.shape = new CircleShape(prop.radius);
}
/** @param {object} prop */
export function syncFloorTriggerAabb(prop) {
    if (prop.halfExtents) centerHalfExtentsAabbInto(prop.aabb, prop.x, prop.y, prop.halfExtents.x, prop.halfExtents.y, NEIGHBOR_QUERY_PAD);
    else centerHalfExtentsAabbInto(prop.aabb, prop.x, prop.y, prop.radius, prop.radius, NEIGHBOR_QUERY_PAD);
}
/** @param {object} prop */
export function floorCircleRadius(prop) {
    return prop.shape?.radius ?? prop.radius;
}
/** @param {object} prop */
export function readFloorPropHalfExtents(prop) {
    if (prop.halfExtents) return { halfWidth: prop.halfExtents.x, halfHeight: prop.halfExtents.y };
    if (prop.shape?.type === "Polygon") {
        const v = prop.shape.vertices[0];
        return { halfWidth: Math.abs(v.x), halfHeight: Math.abs(v.y) };
    }
    throw new Error("readFloorPropHalfExtents requires halfExtents or polygon shape");
}
/** @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry @param {{ _occupants: Set<number> }} floorShape */
export function floorShapeHasLiveOccupant(registry, floorShape) {
    for (const entityId of floorShape._occupants) {
        const entity = registry.get(entityId);
        if (entity && !entity.isDead) return true;
    }
    return false;
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
    syncFloorPropCollisionShape(prop);
    syncFloorTriggerAabb(prop);
}
/** @param {object} prop */
export function initFloorButtonProp(prop) {
    prop._occupants = new Set();
    prop._nextOccupants = new Set();
    prop.buttonLinks = prop.strategy.buttonLinks.map((link) => ({ ...link }));
    prop.inputMode = prop.strategy.inputMode ?? DEFAULT_BUTTON_INPUT_MODE;
    prop.massThreshold = prop.strategy.massThreshold ?? DEFAULT_BUTTON_MASS_THRESHOLD;
    prop.invert = prop.strategy.invert === true;
    prop._toggleLatched = false;
    prop.aabb = createAabb();
    syncFloorPropCollisionShape(prop);
    syncFloorTriggerAabb(prop);
}
/** @param {object} prop @param {number} halfWidth @param {number} halfHeight */
export function resizeFloorPropHalfExtents(prop, halfWidth, halfHeight) {
    prop.halfExtents = { x: halfWidth, y: halfHeight };
    prop.radius = Math.max(halfWidth, halfHeight);
    syncFloorPropCollisionShape(prop);
    syncFloorTriggerAabb(prop);
}
/** @param {import("../grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid */
export function obstacleGridCellHalfExtents(obstacleGrid) {
    const half = obstacleGrid.cellSize * 0.5;
    return { halfWidth: half, halfHeight: half };
}
/** @param {object} prop @param {import("../grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid @param {number} worldX @param {number} worldY */
export function anchorFloorPropToObstacleGrid(prop, obstacleGrid, worldX, worldY) {
    const { col, row, x, y } = snapWorldToObstacleCellCenter(obstacleGrid, worldX, worldY);
    prop.gridCol = col;
    prop.gridRow = row;
    prop.x = x;
    prop.y = y;
    const { halfWidth, halfHeight } = obstacleGridCellHalfExtents(obstacleGrid);
    resizeFloorPropHalfExtents(prop, halfWidth, halfHeight);
}
/** @param {object} prop @param {number} [steps] */
export function rotateCardinalFloorProp(prop, steps = 1) {
    prop.facing = stepCardinalFacing(prop.facing ?? 0, steps);
}
/** @param {import("../../GameState/EntityRegistry.js").EntityRegistry} registry @param {number} col @param {number} row @param {number} [exceptPropId] */
export function findGridAnchoredFloorPropAtCell(registry, col, row, exceptPropId = -1) {
    /** @type {object | null} */
    let hit = null;
    registry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead || !prop.strategy?.gridAnchored || prop.id === exceptPropId) return;
        if (prop.gridCol === col && prop.gridRow === row) hit = prop;
    });
    return hit;
}
/** @param {{ aabb: Aabb2D }} entity @param {import("../../Viewport/Viewport.js").Viewport} viewport */
export function isAabbInView(entity, viewport) {
    return aabbOverlap(entity.aabb, viewport.boundsClip);
}
