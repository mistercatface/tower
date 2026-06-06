/** Expand a screen triangle away from its centroid to hide sub-pixel gaps. */
export function inflateTri(d0, d1, d2, px) {
    const cx = (d0.x + d1.x + d2.x) / 3;
    const cy = (d0.y + d1.y + d2.y) / 3;
    const puff = (p) => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        return { x: p.x + (dx / len) * px, y: p.y + (dy / len) * px };
    };
    return [puff(d0), puff(d1), puff(d2)];
}
/** Expand a screen quad away from its centroid to hide sub-pixel gaps. */
export function inflateQuad(d0, d1, d2, d3, px) {
    const cx = (d0.x + d1.x + d2.x + d3.x) / 4;
    const cy = (d0.y + d1.y + d2.y + d3.y) / 4;
    const puff = (p) => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        return { x: p.x + (dx / len) * px, y: p.y + (dy / len) * px };
    };
    return [puff(d0), puff(d1), puff(d2), puff(d3)];
}
