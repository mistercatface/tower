import { distanceSqToSegment, getCircleSegmentPenetration } from "../geometry/WallGeometry.js";
import { satCheckCollision, entityFacing, SAT_RESULT, getEntityCollisionParts } from "./SatCollision.js";
import { PolygonShape } from "./Shapes.js";
import { boxLocalFootprint } from "../../Math/Poly2D.js";
import { applyPositionCorrection, applySlabPositionCorrection, computeCircleWallContact, computePolygonWallContact } from "./penetration.js";
import { kineticDynamicSlab, kineticStaticSlab } from "./kineticBodySlab.js";
import { inverseMassFromBody } from "../../Motion/bodyMass.js";
import { computeWallBreakStrength } from "../../Sandbox/gridWallDamage.js";
import { dotXY } from "../../Math/Vec2.js";
export function kineticBodyOverlapsWallCandidates(body, candidates) {
    if (!candidates.length) return false;
    const parts = getEntityCollisionParts(body);
    const px = body.x;
    const py = body.y;
    for (let p = 0; p < parts.length; p++) {
        const shape = parts[p];
        if (shape.type === "Circle") {
            const radiusSq = shape.radius * shape.radius;
            for (let i = 0; i < candidates.length; i++) if (distanceSqToSegment(candidates[i], px, py) <= radiusSq) return true;
            continue;
        }
        for (let i = 0; i < candidates.length; i++) {
            const seg = candidates[i];
            const segShape = ensureWallSegmentPolygonShape(seg);
            if (satCheckCollision(px, py, entityFacing(body), shape, seg.x, seg.y, entityFacing(seg), segShape)) return true;
        }
    }
    return false;
}
export function kineticSlabOverlapsWallCandidates(physId, body, candidates) {
    if (!candidates.length) return false;
    const parts = getEntityCollisionParts(body);
    const px = kineticDynamicSlab.x[physId];
    const py = kineticDynamicSlab.y[physId];
    for (let p = 0; p < parts.length; p++) {
        const shape = parts[p];
        if (shape.type === "Circle") {
            const radiusSq = shape.radius * shape.radius;
            for (let i = 0; i < candidates.length; i++) if (distanceSqToSegment(candidates[i], px, py) <= radiusSq) return true;
            continue;
        }
        for (let i = 0; i < candidates.length; i++) {
            const seg = candidates[i];
            const segShape = ensureWallSegmentPolygonShape(seg);
            if (satCheckCollision(px, py, entityFacing(body), shape, seg.x, seg.y, entityFacing(seg), segShape)) return true;
        }
    }
    return false;
}
export function shouldResolveKineticBodyAgainstWalls(body, candidates) {
    if (!body.strategy?.isKinetic) return false;
    if (body.needsWallCollision?.()) return true;
    if (body._physId !== undefined && body._physId !== -1) return kineticSlabOverlapsWallCandidates(body._physId, body, candidates);
    return kineticBodyOverlapsWallCandidates(body, candidates);
}
export function applyBodyStaticSurfaceImpulse(body, normalX, normalY, cx, cy, { restitution = 0, friction = 0.9 } = {}) {
    const bx = body.x;
    const by = body.y;
    const bvx = body.vx;
    const bvy = body.vy;
    const bw = body.angularVelocity;
    if (bvx === undefined || bvy === undefined) return 0;
    const rx = cx - bx;
    const ry = cy - by;
    const w = bw || 0;
    const vpx = bvx - w * ry;
    const vpy = bvy + w * rx;
    const approachDot = dotXY(vpx, vpy, normalX, normalY);
    if (approachDot >= 0) return approachDot;
    const invMassVal = inverseMassFromBody(body);
    const invI = body.momentOfInertia ? 1 / body.momentOfInertia : 0;
    const hasMoment = !!body.momentOfInertia;
    const cross = rx * normalY - ry * normalX;
    const denom = invMassVal + cross * cross * invI;
    const j = (-(1 + restitution) * approachDot) / denom;
    let newVx = bvx + j * normalX * invMassVal;
    let newVy = bvy + j * normalY * invMassVal;
    let newW = bw;
    if (hasMoment) newW = (bw || 0) + j * cross * invI;
    const tx = -normalY;
    const ty = normalX;
    const vpxNew = newVx - newW * ry;
    const vpyNew = newVy + newW * rx;
    const tangentDot = dotXY(vpxNew, vpyNew, tx, ty);
    const crossT = rx * ty - ry * tx;
    const denomT = invMassVal + crossT * crossT * invI;
    const jt = (-tangentDot * (1 - friction)) / denomT;
    newVx += jt * tx * invMassVal;
    newVy += jt * ty * invMassVal;
    if (hasMoment) newW += jt * crossT * invI;
    body.vx = newVx;
    body.vy = newVy;
    if (body.momentOfInertia) body.angularVelocity = newW;
    return approachDot;
}
export function applySlabStaticSurfaceImpulse(physId, normalX, normalY, cx, cy, { restitution = 0, friction = 0.9 } = {}) {
    const bx = kineticDynamicSlab.x[physId];
    const by = kineticDynamicSlab.y[physId];
    const bvx = kineticDynamicSlab.vx[physId];
    const bvy = kineticDynamicSlab.vy[physId];
    const bw = kineticDynamicSlab.w[physId];
    const rx = cx - bx;
    const ry = cy - by;
    const vpx = bvx - bw * ry;
    const vpy = bvy + bw * rx;
    const approachDot = dotXY(vpx, vpy, normalX, normalY);
    if (approachDot >= 0) return approachDot;
    const invMassVal = kineticStaticSlab.invMass[physId];
    const invI = kineticStaticSlab.invI[physId];
    const hasMoment = invI > 0;
    const cross = rx * normalY - ry * normalX;
    const denom = invMassVal + cross * cross * invI;
    const j = (-(1 + restitution) * approachDot) / denom;
    let newVx = bvx + j * normalX * invMassVal;
    let newVy = bvy + j * normalY * invMassVal;
    let newW = bw;
    if (hasMoment) newW = bw + j * cross * invI;
    const tx = -normalY;
    const ty = normalX;
    const vpxNew = newVx - newW * ry;
    const vpyNew = newVy + newW * rx;
    const tangentDot = dotXY(vpxNew, vpyNew, tx, ty);
    const crossT = rx * ty - ry * tx;
    const denomT = invMassVal + crossT * crossT * invI;
    const jt = (-tangentDot * (1 - friction)) / denomT;
    newVx += jt * tx * invMassVal;
    newVy += jt * ty * invMassVal;
    if (hasMoment) newW += jt * crossT * invI;
    kineticDynamicSlab.vx[physId] = newVx;
    kineticDynamicSlab.vy[physId] = newVy;
    kineticDynamicSlab.w[physId] = newW;
    return approachDot;
}
export function ensureWallSegmentPolygonShape(segment) {
    if (!segment.shape) {
        const halfX = segment.width !== undefined ? segment.width / 2 : segment.size / 2;
        const halfY = segment.height !== undefined ? segment.height / 2 : segment.size / 2;
        segment.shape = new PolygonShape(boxLocalFootprint(halfX, halfY));
    }
    return segment.shape;
}
const EMPTY_WALL_HITS = [];
const wallBestScratch = { normalX: 0, normalY: 0, overlap: 0, cx: 0, cy: 0, segment: null };
export function resolveBodyAgainstWallSegments(body, shape, segments, { restitution = 0, friction = 0.9, passes = 2, preSpeed = 0, wallBreakConfig = null } = {}) {
    let collided = false;
    const wantHits = wallBreakConfig != null;
    const hits = wantHits ? [] : EMPTY_WALL_HITS;
    const radius = shape.getBoundingRadius();
    const best = wallBestScratch;
    for (let pass = 0; pass < passes; pass++) {
        let hasBest = false;
        for (const seg of segments) {
            const maxDist = radius + seg.size * 0.75;
            const bx = body.x;
            const by = body.y;
            if (Math.abs(bx - seg.x) > maxDist || Math.abs(by - seg.y) > maxDist) continue;
            let normalX, normalY, overlap;
            let satCollisionFound = false;
            if (shape.type === "Circle") {
                const penetration = getCircleSegmentPenetration({ x: bx, y: by, radius: shape.radius }, seg, { approachX: body.vx ?? 0, approachY: body.vy ?? 0 });
                if (!penetration) continue;
                normalX = penetration.normalX;
                normalY = penetration.normalY;
                overlap = penetration.overlap;
            } else if (shape.type === "Polygon") {
                const segShape = ensureWallSegmentPolygonShape(seg);
                if (!satCheckCollision(bx, by, entityFacing(body), shape, seg.x, seg.y, entityFacing(seg), segShape)) continue;
                normalX = -SAT_RESULT[1];
                normalY = -SAT_RESULT[2];
                overlap = SAT_RESULT[0];
                satCollisionFound = true;
            } else continue;
            if (!hasBest || overlap > best.overlap) {
                best.normalX = normalX;
                best.normalY = normalY;
                best.overlap = overlap;
                best.cx = satCollisionFound ? SAT_RESULT[3] : NaN;
                best.cy = satCollisionFound ? SAT_RESULT[4] : NaN;
                best.segment = seg;
                hasBest = true;
            }
        }
        if (!hasBest) break;
        collided = true;
        const bx = body.x;
        const by = body.y;
        const contact =
            shape.type === "Circle"
                ? computeCircleWallContact({ x: bx, y: by }, best.normalX, best.normalY, shape.radius)
                : computePolygonWallContact({ x: bx, y: by }, best.normalX, best.normalY, best.overlap, best.cx, best.cy);
        const bvx = body.vx ?? 0;
        const bvy = body.vy ?? 0;
        const bw = body.angularVelocity ?? 0;
        const approachDot = dotXY(bvx - bw * (contact.cy - by), bvy + bw * (contact.cx - bx), best.normalX, best.normalY);
        if (wallBreakConfig && preSpeed > 0 && computeWallBreakStrength(preSpeed, approachDot, wallBreakConfig) >= wallBreakConfig.minBreakStrength) {
            hits.push({ approachDot, normalX: best.normalX, normalY: best.normalY, segment: best.segment, overlap: best.overlap, contactX: contact.cx, contactY: contact.cy });
            applyBodyStaticSurfaceImpulse(body, best.normalX, best.normalY, contact.cx, contact.cy, { restitution, friction });
            break;
        }
        applyPositionCorrection(body, best.normalX, best.normalY, best.overlap);
        applyBodyStaticSurfaceImpulse(body, best.normalX, best.normalY, contact.cx, contact.cy, { restitution, friction });
        if (wantHits) hits.push({ approachDot, normalX: best.normalX, normalY: best.normalY, segment: best.segment, overlap: best.overlap, contactX: contact.cx, contactY: contact.cy });
    }
    return { collided, hits };
}
export function resolveSlabAgainstWallSegments(physId, body, shape, segments, { restitution = 0, friction = 0.9, passes = 2, preSpeed = 0, wallBreakConfig = null } = {}) {
    let collided = false;
    const wantHits = wallBreakConfig != null;
    const hits = wantHits ? [] : EMPTY_WALL_HITS;
    const radius = shape.getBoundingRadius();
    const best = wallBestScratch;
    for (let pass = 0; pass < passes; pass++) {
        let hasBest = false;
        for (const seg of segments) {
            const maxDist = radius + seg.size * 0.75;
            const bx = kineticDynamicSlab.x[physId];
            const by = kineticDynamicSlab.y[physId];
            if (Math.abs(bx - seg.x) > maxDist || Math.abs(by - seg.y) > maxDist) continue;
            let normalX, normalY, overlap;
            let satCollisionFound = false;
            if (shape.type === "Circle") {
                const penetration = getCircleSegmentPenetration({ x: bx, y: by, radius: shape.radius }, seg, { approachX: kineticDynamicSlab.vx[physId], approachY: kineticDynamicSlab.vy[physId] });
                if (!penetration) continue;
                normalX = penetration.normalX;
                normalY = penetration.normalY;
                overlap = penetration.overlap;
            } else if (shape.type === "Polygon") {
                const segShape = ensureWallSegmentPolygonShape(seg);
                if (!satCheckCollision(bx, by, entityFacing(body), shape, seg.x, seg.y, entityFacing(seg), segShape)) continue;
                normalX = -SAT_RESULT[1];
                normalY = -SAT_RESULT[2];
                overlap = SAT_RESULT[0];
                satCollisionFound = true;
            } else continue;
            if (!hasBest || overlap > best.overlap) {
                best.normalX = normalX;
                best.normalY = normalY;
                best.overlap = overlap;
                best.cx = satCollisionFound ? SAT_RESULT[3] : NaN;
                best.cy = satCollisionFound ? SAT_RESULT[4] : NaN;
                best.segment = seg;
                hasBest = true;
            }
        }
        if (!hasBest) break;
        collided = true;
        const bx = kineticDynamicSlab.x[physId];
        const by = kineticDynamicSlab.y[physId];
        const contact =
            shape.type === "Circle"
                ? computeCircleWallContact({ x: bx, y: by }, best.normalX, best.normalY, shape.radius)
                : computePolygonWallContact({ x: bx, y: by }, best.normalX, best.normalY, best.overlap, best.cx, best.cy);
        const bvx = kineticDynamicSlab.vx[physId];
        const bvy = kineticDynamicSlab.vy[physId];
        const bw = kineticDynamicSlab.w[physId];
        const approachDot = dotXY(bvx - bw * (contact.cy - by), bvy + bw * (contact.cx - bx), best.normalX, best.normalY);
        if (wallBreakConfig && preSpeed > 0 && computeWallBreakStrength(preSpeed, approachDot, wallBreakConfig) >= wallBreakConfig.minBreakStrength) {
            hits.push({ approachDot, normalX: best.normalX, normalY: best.normalY, segment: best.segment, overlap: best.overlap, contactX: contact.cx, contactY: contact.cy });
            applySlabStaticSurfaceImpulse(physId, best.normalX, best.normalY, contact.cx, contact.cy, { restitution, friction });
            break;
        }
        if (!kineticStaticSlab.pinned[physId]) applySlabPositionCorrection(physId, best.normalX, best.normalY, best.overlap);
        applySlabStaticSurfaceImpulse(physId, best.normalX, best.normalY, contact.cx, contact.cy, { restitution, friction });
        if (wantHits) hits.push({ approachDot, normalX: best.normalX, normalY: best.normalY, segment: best.segment, overlap: best.overlap, contactX: contact.cx, contactY: contact.cy });
    }
    return { collided, hits };
}
