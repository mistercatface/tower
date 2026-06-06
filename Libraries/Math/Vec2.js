/** @typedef {{ x: number; y: number }} Vec2 */
export function vec2(x, y) {
    return { x, y };
}
export function add2(a, b) {
    return vec2(a.x + b.x, a.y + b.y);
}
export function sub2(a, b) {
    return vec2(a.x - b.x, a.y - b.y);
}
export function scale2(v, s) {
    return vec2(v.x * s, v.y * s);
}
export function dot2(a, b) {
    return a.x * b.x + a.y * b.y;
}
export function length2(v) {
    return Math.hypot(v.x, v.y);
}
export function normalize2(v) {
    const len = length2(v);
    if (len <= 0) return { x: 0, y: 0, len: 0 };
    return { x: v.x / len, y: v.y / len, len };
}
export function normalizeVector(dx, dy) {
    return normalize2({ x: dx, y: dy });
}
/** Reflect direction `(dx, dy)` off a surface normal `(nx, ny)`. */
export function reflect2(dx, dy, nx, ny) {
    const dot = dx * nx + dy * ny;
    return { dx: dx - 2 * dot * nx, dy: dy - 2 * dot * ny };
}
