/** @typedef {{ x: number; y: number; z: number }} Vec3 */
/** @typedef {{ u: number; v: number }} Vec2 */
/** @typedef {{ cx: number; cy: number; referenceDepth: number; screenScale: number; yaw: number; pitch: number }} InspectCamera */

export function vec3(x, y, z) {
    return { x, y, z };
}

export function vec2(u, v) {
    return { u, v };
}

export function add(a, b) {
    return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

export function sub(a, b) {
    return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function scale(v, s) {
    return vec3(v.x * s, v.y * s, v.z * s);
}

export function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a, b) {
    return vec3(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
    );
}

export function length(v) {
    return Math.hypot(v.x, v.y, v.z);
}

export function normalize(v) {
    const len = length(v) || 1;
    return scale(v, 1 / len);
}

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

export function triangleNormal(a, b, c) {
    return cross(sub(b, a), sub(c, a));
}

export function faceVisible(normal, epsilon = 1e-4) {
    return normal.z < -epsilon;
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

export function pushTriangle(triangles, a, b, c, material, {
    uvA = null,
    uvB = null,
    uvC = null,
    normal = null,
} = {}) {
    triangles.push({
        a, b, c,
        uvA, uvB, uvC,
        material,
        normal: normal ?? normalize(triangleNormal(a, b, c)),
    });
}

export function pushQuad(triangles, a, b, c, d, material, {
    uvA = null,
    uvB = null,
    uvC = null,
    uvD = null,
    normal = null,
} = {}) {
    const n = normal ?? normalize(cross(sub(b, a), sub(c, a)));
    pushTriangle(triangles, a, b, c, material, { uvA, uvB, uvC, normal: n });
    pushTriangle(triangles, a, c, d, material, { uvA, uvC, uvD, normal: n });
}
