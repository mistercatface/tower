import { resolveBodyRadius } from "../Motion/bodyDefaults.js";
import { quantizeAngle } from "../Canvas/viewQuantize.js";
import { clamp } from "../Math/Interpolate.js";
import { lengthXY, normalizeXY } from "../Math/Vec2.js";
/** @type {{ w: number, x: number, y: number, z: number }} */
export const IDENTITY_ROLL_QUAT = { w: 1, x: 0, y: 0, z: 0 };
export function multiplyQuat(a, b) {
    return {
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    };
}
export function axisAngleQuat(ax, ay, az, angle) {
    const half = angle * 0.5;
    const s = Math.sin(half);
    return { w: Math.cos(half), x: ax * s, y: ay * s, z: az * s };
}
export function normalizeQuat(q) {
    const len = Math.hypot(q.w, q.x, q.y, q.z);
    if (len < 1e-8) {
        q.w = 1;
        q.x = 0;
        q.y = 0;
        q.z = 0;
        return q;
    }
    q.w /= len;
    q.x /= len;
    q.y /= len;
    q.z /= len;
    return q;
}
export function rotateVecByQuat(x, y, z, q) {
    const ix = q.w * x + q.y * z - q.z * y;
    const iy = q.w * y + q.z * x - q.x * z;
    const iz = q.w * z + q.x * y - q.y * x;
    const iw = -q.x * x - q.y * y - q.z * z;
    return { x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x };
}
export function transformRollVertex(lx, ly, lz, radius, rollQuat = IDENTITY_ROLL_QUAT) {
    const rotated = rotateVecByQuat(lx, ly, lz - radius, rollQuat);
    return { lx: rotated.x, ly: rotated.y, z: rotated.z + radius };
}
export function getRollRadius(body) {
    return Math.max(1, resolveBodyRadius(body));
}
function integrateGroundRoll(body, dtMs) {
    const vx = body.vx ?? 0;
    const vy = body.vy ?? 0;
    const speed = lengthXY(vx, vy);
    if (speed < 0.5) {
        if (body.rollQuat) body.rollQuat = dampQuatTwist(body.rollQuat, dtMs, 3.0);
        return;
    }
    const r = getRollRadius(body);
    const angle = -(speed / r) * (dtMs / 1000);
    const { nx: ax, ny: ay } = normalizeXY(-vy, vx);
    const delta = axisAngleQuat(ax, ay, 0, angle);
    const q = multiplyQuat(delta, body.rollQuat ?? IDENTITY_ROLL_QUAT);
    body.rollQuat = dampQuatTwist(normalizeQuat(q), dtMs, 1.8);
}
export function dampQuatTwist(q, dtMs, dampingRate = 1.8) {
    const w = q.w ?? 1;
    const x = q.x ?? 0;
    const y = q.y ?? 0;
    const z = q.z ?? 0;
    let w_t = w;
    let z_t = z;
    const len = Math.hypot(w_t, z_t);
    if (len < 1e-6) return q;
    w_t /= len;
    z_t /= len;
    const q_swing = multiplyQuat(q, { w: w_t, x: 0, y: 0, z: -z_t });
    const decay = Math.exp(-dampingRate * (dtMs / 1000));
    let z_t_new = z_t * decay;
    let w_t_new = w_t;
    const len_new = Math.hypot(w_t_new, z_t_new);
    if (len_new > 1e-6) {
        w_t_new /= len_new;
        z_t_new /= len_new;
    }
    return normalizeQuat(multiplyQuat(q_swing, { w: w_t_new, x: 0, y: 0, z: z_t_new }));
}
export function absorbCollisionRollImpulse(body, dtMs) {
    const w = body.angularVelocity ?? 0;
    if (Math.abs(w) < 0.02) return;
    const angle = -w * (dtMs / 1000);
    const delta = axisAngleQuat(0, 0, 1, angle);
    body.rollQuat = normalizeQuat(multiplyQuat(delta, body.rollQuat ?? IDENTITY_ROLL_QUAT));
}
export function integrateRollOrientation(body, dtMs) {
    integrateGroundRoll(body, dtMs);
}
export function quantizeRollQuat(rollQuat, steps = 16) {
    const q = rollQuat ?? IDENTITY_ROLL_QUAT;
    const angle = 2 * Math.acos(clamp(q.w ?? 1, -1, 1));
    if (angle < 1e-4) return IDENTITY_ROLL_QUAT;
    const s = Math.sin(angle * 0.5);
    if (Math.abs(s) < 1e-4) return IDENTITY_ROLL_QUAT;
    const ax = (q.x ?? 0) / s;
    const ay = (q.y ?? 0) / s;
    const heading = Math.atan2(ay, ax);
    const qAngle = quantizeAngle(angle, steps);
    const qHeading = quantizeAngle(heading, steps);
    return axisAngleQuat(Math.cos(qHeading), Math.sin(qHeading), 0, qAngle);
}
export function buildRollOrientKey(rollQuat, steps = 16) {
    const q = quantizeRollQuat(rollQuat, steps);
    const angle = 2 * Math.acos(clamp(q.w, -1, 1));
    if (angle < 1e-4) return "r0_0";
    const s = Math.sin(angle * 0.5);
    const heading = Math.atan2(q.y / s, q.x / s);
    const angleBucket = Math.round((angle / (Math.PI * 2)) * steps) % steps;
    const axisBucket = Math.round(((heading + Math.PI) / (Math.PI * 2)) * steps) % steps;
    return `r${angleBucket}_${axisBucket}`;
}
