/** @typedef {{ x: number; y: number }} Vec2 */
// --- Scalar core (zero alloc — use in physics / collision hot paths) ---
/** @returns {number} */
export function dotXY(vx, vy, nx, ny) {
    return vx * nx + vy * ny;
}
/** @returns {number} */
export function lengthXY(vx, vy) {
    return Math.hypot(vx, vy);
}
/** @returns {number} */
export function speedSqXY(vx, vy) {
    return vx * vx + vy * vy;
}
/** @returns {{ nx: number, ny: number, len: number }} */
export function normalizeXY(dx, dy) {
    const len = Math.hypot(dx, dy);
    if (len <= 0) return { nx: 0, ny: 0, len: 0 };
    return { nx: dx / len, ny: dy / len, len };
}
/** @param {{ x: number, y: number }} body */
export function addXY(body, dx, dy) {
    body.x += dx;
    body.y += dy;
}
/** Reflect direction `(dx, dy)` off a surface normal `(nx, ny)`. */
export function reflect2(dx, dy, nx, ny) {
    const dot = dotXY(dx, dy, nx, ny);
    return { dx: dx - 2 * dot * nx, dy: dy - 2 * dot * ny };
}
// --- Object helpers (may alloc — convenience for non-hot paths) ---
export function vec2(x, y) {
    return { x, y };
}
export function dot2(a, b) {
    return dotXY(a.x, a.y, b.x, b.y);
}
export function length2(v) {
    return lengthXY(v.x, v.y);
}
export function normalize2(v) {
    const { nx, ny, len } = normalizeXY(v.x, v.y);
    return { x: nx, y: ny, len };
}
/** Unit direction as `{ x, y, len }` — alias for callers that use x/y keys. */
export function normalizeVector(dx, dy) {
    const { nx, ny, len } = normalizeXY(dx, dy);
    return { x: nx, y: ny, len };
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
