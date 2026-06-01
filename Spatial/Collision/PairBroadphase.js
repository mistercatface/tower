/** Shared actor–pushable pair predicate: movement + OBB/circle broad-phase (conservative). */

export const MOVING_SPEED_SQ = 0.25;

export function isMovingEntity(entity) {
    const vx = entity.vx || 0;
    const vy = entity.vy || 0;
    return vx * vx + vy * vy > MOVING_SPEED_SQ;
}

function entityAngle(entity) {
    return entity.facing ?? entity.angle ?? 0;
}

/**
 * @returns {{ kind: 'circle', cx: number, cy: number, r: number } | { kind: 'obb', cx: number, cy: number, hx: number, hy: number, cos: number, sin: number }}
 */
export function getBroadphaseBounds(entity) {
    const shape = entity.getShape();
    if (shape.type === "Circle") {
        return { kind: "circle", cx: entity.x, cy: entity.y, r: shape.radius };
    }
    if (shape.type === "Polygon") {
        const angle = entityAngle(entity);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        let hx;
        let hy;
        if (entity.halfExtents) {
            hx = entity.halfExtents.x;
            hy = entity.halfExtents.y;
        } else {
            hx = 0;
            hy = 0;
            for (let i = 0; i < shape.vertices.length; i++) {
                const v = shape.vertices[i];
                hx = Math.max(hx, Math.abs(v.x));
                hy = Math.max(hy, Math.abs(v.y));
            }
        }
        return { kind: "obb", cx: entity.x, cy: entity.y, hx, hy, cos, sin };
    }
    const r = entity.radius || 0;
    return { kind: "circle", cx: entity.x, cy: entity.y, r };
}

function projectCircle(axisX, axisY, circle) {
    const c = circle.cx * axisX + circle.cy * axisY;
    return { min: c - circle.r, max: c + circle.r };
}

function projectObb(axisX, axisY, obb) {
    const ux = obb.cos;
    const uy = obb.sin;
    const vx = -obb.sin;
    const vy = obb.cos;
    const c = obb.cx * axisX + obb.cy * axisY;
    const radius =
        obb.hx * Math.abs(ux * axisX + uy * axisY) +
        obb.hy * Math.abs(vx * axisX + vy * axisY);
    return { min: c - radius, max: c + radius };
}

function intervalsSeparated(a, b) {
    return a.min > b.max || b.min > a.max;
}

function obbObbOverlap(a, b) {
    const axes = [
        [a.cos, a.sin],
        [-a.sin, a.cos],
        [b.cos, b.sin],
        [-b.sin, b.cos],
    ];
    for (let i = 0; i < axes.length; i++) {
        const ax = axes[i][0];
        const ay = axes[i][1];
        if (intervalsSeparated(projectObb(ax, ay, a), projectObb(ax, ay, b))) {
            return false;
        }
    }
    return true;
}

function circleObbOverlap(circle, obb) {
    const axes = [
        [obb.cos, obb.sin],
        [-obb.sin, obb.cos],
    ];
    const dx = circle.cx - obb.cx;
    const dy = circle.cy - obb.cy;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
        axes.push([dx / len, dy / len]);
    }
    for (let i = 0; i < axes.length; i++) {
        const ax = axes[i][0];
        const ay = axes[i][1];
        if (intervalsSeparated(projectCircle(ax, ay, circle), projectObb(ax, ay, obb))) {
            return false;
        }
    }
    return true;
}

export function pairBroadphaseOverlap(a, b) {
    const ba = getBroadphaseBounds(a);
    const bb = getBroadphaseBounds(b);

    if (ba.kind === "circle" && bb.kind === "circle") {
        const dx = ba.cx - bb.cx;
        const dy = ba.cy - bb.cy;
        const radii = ba.r + bb.r;
        return dx * dx + dy * dy < radii * radii;
    }
    if (ba.kind === "circle" && bb.kind === "obb") {
        return circleObbOverlap(ba, bb);
    }
    if (ba.kind === "obb" && bb.kind === "circle") {
        return circleObbOverlap(bb, ba);
    }
    if (ba.kind === "obb" && bb.kind === "obb") {
        return obbObbOverlap(ba, bb);
    }
    return false;
}

export function isPairActive(a, b) {
    return isMovingEntity(a) || isMovingEntity(b);
}

export function shouldResolveActorPushable(actor, pickup) {
    return isPairActive(actor, pickup) || pairBroadphaseOverlap(actor, pickup);
}
