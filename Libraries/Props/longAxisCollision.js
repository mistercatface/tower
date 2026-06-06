import { resolveBodyRadius } from "../Motion/bodyDefaults.js";
import { CircleShape, PolygonShape } from "../Spatial/collision/Shapes.js";
import { buildLongAxisFootprintObb, isStandTipFallen, isStandTipProp, isStandTipTilted, longAxisBoxDimsFromProp } from "../Spatial/transforms/longAxisBox3d.js";
const STAND_CIRCLE_THRESHOLD = 0.06;
/**
 * @param {object} prop
 */
export function usesLongAxisCollisionShape(prop) {
    if (prop.strategy?.rollAxis === "long" && !prop.strategy?.standTip) return Boolean(prop.halfExtents || prop.strategy?.halfExtents);
    if (isStandTipTilted(prop) || isStandTipFallen(prop)) return true;
    return false;
}
/**
 * Sync collision to long-axis box pose. Never mutates prop.radius (avoids huge broadphase/render).
 *
 * @param {object} prop
 */
export function syncLongAxisCollisionShape(prop) {
    if (isStandTipProp(prop) && !isStandTipTilted(prop) && !isStandTipFallen(prop)) {
        prop._collisionFacing = null;
        prop._collisionHalfExtents = null;
        prop._longAxisShapeKey = null;
        if (!prop.shape || prop.shape.type !== "Circle") prop.shape = new CircleShape(resolveBodyRadius(prop));
        return prop.shape;
    }
    if (prop.strategy?.rollAxis === "long" && prop.strategy?.standTip && (prop.rollAngle ?? 0) < STAND_CIRCLE_THRESHOLD && !prop.isFallen) {
        prop._collisionFacing = null;
        prop._collisionHalfExtents = null;
        if (!prop.shape || prop.shape.type !== "Circle") prop.shape = new CircleShape(resolveBodyRadius(prop));
        return prop.shape;
    }
    const { hx, hy, height } = longAxisBoxDimsFromProp(prop);
    const facing = prop.facing ?? 0;
    const rollAngle = prop.rollAngle ?? 0;
    const key = `la_${rollAngle.toFixed(2)}_${facing.toFixed(2)}_${hx}_${hy}`;
    if (prop._longAxisShapeKey === key && prop.shape?.type === "Polygon") return prop.shape;
    const footprint = buildLongAxisFootprintObb(hx, hy, height, facing, rollAngle);
    prop.shape = new PolygonShape(footprint.vertices);
    prop._collisionHalfExtents = { ...footprint.halfExtents };
    prop._collisionFacing = footprint.facing;
    prop._collisionBoundingRadius = footprint.boundingRadius;
    prop._longAxisShapeKey = key;
    return prop.shape;
}
