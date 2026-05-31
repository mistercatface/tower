/** @typedef {{ cx: number; cy: number; referenceDepth: number; screenScale: number; yaw: number; pitch: number }} InspectCamera */

import { vec3, scale, normalize, length } from "../../../Math/Vec3.js";
import { add, sub, cross, dot } from "../../../Math/Vec3.js";

export { vec3, add, sub, scale, dot, cross, normalize, length };

export function rotateY(v, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

export function rotateX(v, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

export function transformPoint(v, yaw, pitch) {
    return rotateX(rotateY(v, yaw), pitch);
}

export function transformNormal(v, yaw, pitch) {
    return normalize(transformPoint(v, yaw, pitch));
}

/**
 * Weak-perspective projection matching the original inspect viewer.
 * Camera sits on -Z; nearer points have more negative z and appear larger.
 */
export function projectPoint(v, camera) {
    const denom = camera.referenceDepth + v.z;
    if (denom <= 0.05) return null;
    const f = camera.referenceDepth / denom;
    const s = camera.screenScale * f;
    return {
        x: camera.cx + v.x * s,
        y: camera.cy - v.y * s,
        z: v.z,
        depth: v.z,
    };
}

export function averageDepth(a, b, c) {
    return (a.z + b.z + c.z) / 3;
}

export function createInspectCamera(cx, cy, scale, yaw, pitch, {
    referenceDepth = 420,
    screenScale = scale * 88,
} = {}) {
    return { cx, cy, referenceDepth, screenScale, yaw, pitch };
}
