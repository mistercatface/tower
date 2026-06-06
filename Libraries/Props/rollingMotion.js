import { quantizeAngle } from "../Canvas/viewQuantize.js";
import { clamp } from "../Math/Interpolate.js";

/** @type {{ w: number, x: number, y: number, z: number }} */
export const IDENTITY_ROLL_QUAT = { w: 1, x: 0, y: 0, z: 0 };

/**
 * @param {{ w: number, x: number, y: number, z: number }} a
 * @param {{ w: number, x: number, y: number, z: number }} b
 */
export function multiplyQuat(a, b) {
    return {
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    };
}

/**
 * @param {number} ax
 * @param {number} ay
 * @param {number} az
 * @param {number} angle
 */
export function axisAngleQuat(ax, ay, az, angle) {
    const half = angle * 0.5;
    const s = Math.sin(half);
    return { w: Math.cos(half), x: ax * s, y: ay * s, z: az * s };
}

/**
 * @param {{ w: number, x: number, y: number, z: number }} q
 */
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

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {{ w: number, x: number, y: number, z: number }} q
 */
export function rotateVecByQuat(x, y, z, q) {
    const ix = q.w * x + q.y * z - q.z * y;
    const iy = q.w * y + q.z * x - q.x * z;
    const iz = q.w * z + q.x * y - q.y * x;
    const iw = -q.x * x - q.y * y - q.z * z;
    return {
        x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
        y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
        z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
    };
}

/**
 * Rotate a ground-anchored sphere vertex by roll orientation (center at z = radius).
 *
 * @param {number} lx
 * @param {number} ly
 * @param {number} lz
 * @param {number} radius
 * @param {{ w: number, x: number, y: number, z: number }} [rollQuat]
 */
export function transformRollVertex(lx, ly, lz, radius, rollQuat = IDENTITY_ROLL_QUAT) {
    const rotated = rotateVecByQuat(lx, ly, lz - radius, rollQuat);
    return { lx: rotated.x, ly: rotated.y, z: rotated.z + radius };
}

/**
 * Effective rolling radius: sphere uses radius; boxes/logs use smaller ground half-extent.
 *
 * @param {{ radius?: number, halfExtents?: { x: number, y: number } }} body
 */
export function getRollRadius(body) {
    const strategy = body.strategy ?? {};
    if (strategy.standTip && body.isFallen) {
        const h = strategy.rollHeight ?? strategy.uprightHeight ?? (body._baseRadius ?? body.radius ?? 8) * 2.5;
        return Math.max(1, Math.min(body.halfExtents?.x ?? h * 0.5, body.halfExtents?.y ?? h * 0.5));
    }
    if (strategy.rollAxis === "long") {
        return Math.max(1, strategy.rollHeight ?? 3);
    }
    if (body.halfExtents) {
        return Math.max(1, Math.min(body.halfExtents.x, body.halfExtents.y));
    }
    return Math.max(1, body.radius ?? 8);
}

/** Sphere / ball: ω axis in the ground plane. */
function integrateGroundRoll(body, dtMs) {
    const vx = body.vx ?? 0;
    const vy = body.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    if (speed < 0.5) return;

    const r = getRollRadius(body);
    const angle = -(speed / r) * (dtMs / 1000);
    const ax = -vy / speed;
    const ay = vx / speed;

    const delta = axisAngleQuat(ax, ay, 0, angle);
    body.rollQuat = normalizeQuat(multiplyQuat(delta, body.rollQuat ?? IDENTITY_ROLL_QUAT));
}

/**
 * Log 3D tumble (rollAngle): end-over-end about local long axis (X).
 * Only sideways slide drives roll — in-plane spin (facing / ω_z) is separate.
 */
export function integrateLongAxisRoll(body, dtMs) {
    const vx = body.vx ?? 0;
    const vy = body.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    const spinRate = Math.abs(body.angularVelocity ?? 0);

    const facing = body.facing ?? 0;
    const longX = Math.cos(facing);
    const longY = Math.sin(facing);
    const perpVel = longX * vy - longY * vx;
    const perpSpeed = Math.abs(perpVel);

    if (perpSpeed < 0.2) return;
    if (perpSpeed < 0.4 && spinRate > 0.12) return;

    const perpRatio = perpSpeed / Math.max(speed, 0.01);
    if (perpRatio < 0.22) return;

    const r = getRollRadius(body);
    const tumble = (perpSpeed / r) * (dtMs / 1000) * Math.min(1, perpRatio * 1.4);
    body.rollAngle = (body.rollAngle ?? 0) - Math.sign(perpVel) * tumble;
}

/**
 * Collision pairs write angularVelocity about Z; rolling props absorb it into rollQuat.
 *
 * @param {{ angularVelocity?: number, strategy?: { rollAxis?: string } }} body
 * @param {number} dtMs
 */
export function absorbCollisionRollImpulse(body, dtMs) {
    const w = body.angularVelocity ?? 0;
    if (Math.abs(w) < 0.02) return;

    const angle = -w * (dtMs / 1000);
    if (body.strategy?.rollAxis === "long" || body.strategy?.standTip) {
        return;
    }

    const vx = body.vx ?? 0;
    const vy = body.vy ?? 0;
    const speed = Math.hypot(vx, vy) || 1;
    const delta = axisAngleQuat(-vy / speed, vx / speed, 0, angle);
    body.rollQuat = normalizeQuat(multiplyQuat(delta, body.rollQuat ?? IDENTITY_ROLL_QUAT));
}

/**
 * @param {{ vx?: number, vy?: number, radius?: number, facing?: number, halfExtents?: { x: number, y: number }, strategy?: { rollAxis?: string, rollHeight?: number }, rollQuat?: { w: number, x: number, y: number, z: number } }} body
 * @param {number} dtMs
 */
export function integrateRollOrientation(body, dtMs) {
    const axis = body.strategy?.rollAxis;
    if (axis === "long") {
        integrateLongAxisRoll(body, dtMs);
        return;
    }
    integrateGroundRoll(body, dtMs);
}

/**
 * Snap roll orientation for quantized sprite cache buckets.
 *
 * @param {{ w?: number, x?: number, y?: number, z?: number } | null | undefined} rollQuat
 * @param {number} [steps]
 */
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

/**
 * @param {{ w?: number, x?: number, y?: number, z?: number } | null | undefined} rollQuat
 * @param {number} [steps]
 */
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
