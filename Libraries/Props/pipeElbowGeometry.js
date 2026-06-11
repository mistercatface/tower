import { getPropAsset } from "./PropCatalog.js";
import { PolygonShape } from "../Spatial/collision/Shapes.js";
import { quantizeAngleIndex } from "../Canvas/viewQuantize.js";
const FACING_STEPS = 24;
/** @param {object} prop @param {object | null | undefined} asset */
export function getPipeElbowSpec(prop, asset) {
    const cfg = asset?.visuals?.world ?? {};
    const playW = prop._pipeElbowPlayfieldWidth ?? null;
    const scale = playW != null ? playW / 120 : 1;
    return {
        outletLength: (cfg.outletLength ?? 14) * scale,
        bendRadius: (cfg.bendRadius ?? 6) * scale,
        pipeRadius: (cfg.pipeRadius ?? 3.5) * scale,
        riserHeight: (cfg.riserHeight ?? 12) * scale,
        flangeRadius: (cfg.flangeRadius ?? 5) * scale,
        flangeHeight: (cfg.flangeHeight ?? 1.8) * scale,
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
    for (let i = 0; i <= arcSteps; i++) {
        const a = Math.PI + (Math.PI / 2) * (i / arcSteps);
        pts.push({ x: R + R * Math.cos(a), y: 0, z: zArc + R * Math.sin(a) });
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
    /** @type {{ lx: number, ly: number }[]} */
    const pts = [];
    for (let i = 0; i <= arcSeg; i++) {
        const a = Math.PI * 0.5 + (Math.PI * i) / arcSeg;
        pts.push({ lx: baseR * Math.cos(a), ly: baseR * Math.sin(a) });
    }
    pts.push({ lx: endX, ly: mouthR });
    for (let i = 0; i <= arcSeg; i++) {
        const a = -Math.PI * 0.5 + (Math.PI * i) / arcSeg;
        pts.push({ lx: endX + mouthR * Math.cos(a), ly: mouthR * Math.sin(a) });
    }
    pts.push({ lx: 0, ly: -baseR });
    return pts;
}
/** @param {object} prop */
export function syncPipeElbowCollisionShape(prop) {
    const asset = getPropAsset(prop.type);
    const spec = getPipeElbowSpec(prop, asset);
    const footprint = buildPipeElbowCollisionFootprint(spec);
    const key = footprint.map((p) => `${p.lx.toFixed(1)},${p.ly.toFixed(1)}`).join("|");
    prop._collisionFacing = prop.facing ?? 0;
    if (prop._pipeElbowShapeKey === key && prop.shape?.type === "Polygon") return prop.shape;
    prop.shape = new PolygonShape(footprint);
    prop._pipeElbowShapeKey = key;
    let maxR = 0;
    for (let i = 0; i < footprint.length; i++) maxR = Math.max(maxR, Math.hypot(footprint[i].lx, footprint[i].ly));
    prop._collisionBoundingRadius = maxR;
    return prop.shape;
}
/** @param {object} prop */
export function getPipeElbowSpriteCacheKey(prop) {
    const asset = getPropAsset(prop.type);
    const spec = getPipeElbowSpec(prop, asset);
    return `pe_${Math.round(spec.outletLength)}_${Math.round(spec.bendRadius)}_f${quantizeAngleIndex(prop.facing ?? 0, FACING_STEPS)}`;
}
