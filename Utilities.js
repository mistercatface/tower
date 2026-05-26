export class Utilities {
    static distToSegment(px, py, vx, vy, wx, wy) {
        const l2 = (wx - vx) ** 2 + (wy - vy) ** 2;
        if (l2 === 0) return Math.hypot(px - vx, py - vy);
        let t = ((px - vx) * (wx - vx) + (py - vy) * (wy - vy)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (vx + t * (wx - vx)), py - (vy + t * (wy - vy)));
    }

    static hasLineOfSight(x1, y1, x2, y2, segments, padding = 0) {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);

        for (const seg of segments) {
            if (seg.isDead) continue;
            const limit = seg.size * 0.5 + padding;
            if (seg.x < minX - limit || seg.x > maxX + limit ||
                seg.y < minY - limit || seg.y > maxY + limit) {
                continue;
            }
            const dist = this.distToSegment(seg.x, seg.y, x1, y1, x2, y2);
            if (dist < limit) {
                return false;
            }
        }
        return true;
    }

    static normalizeAngle(angle) {
        return Math.atan2(Math.sin(angle), Math.cos(angle));
    }
}