import { getPropAsset } from "./PropCatalog.js";
import { PolygonShape } from "../Spatial/collision/Shapes.js";
import { quantizeAngleIndex } from "../Canvas/viewQuantize.js";
const FLIPPER_ANGLE_STEPS = 24;
/** @param {object} prop */
export function getFlipperSpriteCacheKey(prop) {
    const asset = getPropAsset(prop.type);
    const angle = prop._flipperAngle ?? asset?.flipper?.restAngle ?? 0.45;
    const active = prop._flipperTarget === "active" || prop._flipperButtonPressed ? 1 : 0;
    return `a${quantizeAngleIndex(angle, FLIPPER_ANGLE_STEPS)}_${active}`;
}
/** @param {object} prop */
export function isFlipperProp(prop) {
    return prop?.type === "flipper";
}
/** @param {object} prop @param {object} asset */
function flipperSpec(prop, asset) {
    return { length: asset?.flipper?.length ?? 32, width: asset?.flipper?.width ?? 8, restAngle: prop._flipperRestAngle ?? asset?.flipper?.restAngle ?? 0.45 };
}
/** @param {object} prop */
export function syncFlipperCollisionShape(prop) {
    const asset = getPropAsset(prop.type);
    if (prop._flipperAngle == null) prop._flipperAngle = flipperSpec(prop, asset).restAngle;
    const { length, width } = flipperSpec(prop, asset);
    const halfW = width * 0.5;
    const angle = prop._flipperAngle;
    const isMirrored = Math.abs(prop.facing || 0) > Math.PI / 2;
    const key = `flip_${angle.toFixed(3)}_${length}_${halfW}_${isMirrored}`;
    if (prop._flipperShapeKey === key && prop.shape?.type === "Polygon") return prop.shape;
    const tipR = Math.max(1, halfW * 0.45);
    const my = isMirrored ? -1 : 1;
    const pts = [
        { x: 0, y: -halfW * my },
        { x: length - tipR, y: -tipR * my },
        { x: length, y: 0 },
        { x: length - tipR, y: tipR * my },
        { x: 0, y: halfW * my },
    ];
    if (isMirrored) pts.reverse();
    prop.shape = new PolygonShape(pts);
    prop._collisionFacing = angle;
    prop._collisionBoundingRadius = Math.hypot(length, halfW);
    prop._flipperShapeKey = key;
    return prop.shape;
}
