/** @typedef {{ x: number; y: number; z: number }} Vec3 */
export function vec3(x, y, z) {
    return { x, y, z };
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
    return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
export function length(v) {
    return Math.hypot(v.x, v.y, v.z);
}
export function distance(a, b) {
    return length(sub(a, b));
}
export function normalize(v) {
    const len = length(v) || 1;
    return scale(v, 1 / len);
}
