import { getPropAsset } from "./PropCatalog.js";
import { PolygonShape } from "../Spatial/collision/Shapes.js";
import { transformPoint2DInto } from "../Math/Poly2D.js";
import { quantizeAngleIndex } from "../Math/Angle.js";
const FACING_STEPS = 24;
/** @param {object} prop @param {object | null | undefined} asset */
export function getPipeElbowSpec(prop, asset) {
    const cfg = asset?.visuals?.world ?? {};
    const playW = prop._pipeElbowPlayfieldWidth ?? null;
    const scale = playW != null ? playW / 120 : 1;
    return {
        outletLength: cfg.outletLength * scale,
        bendRadius: cfg.bendRadius * scale,
        pipeRadius: cfg.pipeRadius * scale,
        riserHeight: cfg.riserHeight * scale,
        flangeRadius: cfg.flangeRadius * scale,
        flangeHeight: cfg.flangeHeight * scale,
    };
}
/**
 * 3D centerline in local space: vertical (+Z) → elbow in XZ plane → horizontal (+X).
 * @param {ReturnType<typeof getPipeElbowSpec>} spec
 */
export function buildPipeElbowCenterline3D(spec) {
    const { riserHeight, bendRadius: R, outletLength } = spec;
    const zArc = riserHeight - R;
    /** @type {{ x: number, y: number, z: number }[]} */
    const pts = [{ x: 0, y: 0, z: 0 }];
    const riserSteps = 5;
    for (let i = 1; i <= riserSteps; i++) pts.push({ x: 0, y: 0, z: (zArc * i) / riserSteps });
    const arcSteps = 8;
    for (let i = 1; i <= arcSteps; i++) {
        const theta = (i / arcSteps) * (Math.PI / 2);
        pts.push({ x: R - R * Math.cos(theta), y: 0, z: zArc + R * Math.sin(theta) });
    }
    const outSteps = 5;
    for (let i = 1; i <= outSteps; i++) pts.push({ x: R + (outletLength * i) / outSteps, y: 0, z: riserHeight });
    return pts;
}
/** @param {ReturnType<typeof getPipeElbowSpec>} spec */
export function buildPipeElbowCollisionFootprint(spec) {
    const endX = spec.bendRadius + spec.outletLength;
    const baseR = spec.flangeRadius;
    const mouthR = spec.pipeRadius * 1.15;
    const arcSeg = 6;
    /** @type {{ x: number, y: number }[]} */
    const pts = [];
    for (let i = 0; i <= arcSeg; i++) {
        const a = Math.PI * 0.5 + (Math.PI * i) / arcSeg;
        pts.push({ x: baseR * Math.cos(a), y: baseR * Math.sin(a) });
    }
    for (let i = 0; i <= arcSeg; i++) {
        const a = -Math.PI * 0.5 + (Math.PI * i) / arcSeg;
        pts.push({ x: endX + mouthR * Math.cos(a), y: mouthR * Math.sin(a) });
    }
    return pts;
}
/** @param {object} prop */
export function syncPipeElbowCollisionShape(prop) {
    const asset = getPropAsset(prop.type);
    const spec = getPipeElbowSpec(prop, asset);
    const footprint = buildPipeElbowCollisionFootprint(spec);
    const key = footprint.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("|");
    prop._collisionFacing = prop.facing ?? 0;
    if (prop._pipeElbowShapeKey === key && prop.shape?.type === "Polygon") return prop.shape;
    prop.shape = new PolygonShape(footprint);
    prop._pipeElbowShapeKey = key;
    return prop.shape;
}
/** @param {object} prop @param {object | null | undefined} asset */
export function getPipeElbowOutletWorld(prop, asset) {
    const spec = getPipeElbowSpec(prop, asset);
    const centerline = buildPipeElbowCenterline3D(spec);
    const end = centerline[centerline.length - 1];
    const facing = prop.facing ?? 0;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const world = transformPoint2DInto({ x: 0, y: 0 }, prop.x, prop.y, end.x, end.y, cos, sin);
    return { x: world.x, y: world.y, nx: cos, ny: sin };
}
/** @param {object} prop */
export function getPipeElbowSpriteCacheKey(prop) {
    const asset = getPropAsset(prop.type);
    const spec = getPipeElbowSpec(prop, asset);
    return `pe_${Math.round(spec.outletLength)}_${Math.round(spec.bendRadius)}_f${quantizeAngleIndex(prop.facing ?? 0, FACING_STEPS)}`;
}
