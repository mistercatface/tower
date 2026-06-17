export const EPS = 1e-9;
export function assertNear(actual, expected, eps = EPS, label = "value") {
    if (Math.abs(actual - expected) > eps) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}
export function assertPointNear(point, x, y, eps = EPS, label = "point") {
    assertNear(point.x, x, eps, `${label}.x`);
    assertNear(point.y, y, eps, `${label}.y`);
}
/** Segment as flat coords: ax, ay, bx, by */
export function seg(ax, ay, bx, by) {
    return { ax, ay, bx, by };
}
