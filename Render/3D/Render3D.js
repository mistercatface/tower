export class Render3D {
    constructor() {
        this.lastWalls = null;
        this.lastAliveCount = 0;
        this.sharedEdgesDirty = true;
    }

    drawExplosion(px, py, maxDist, state, targetCtx) {
        const aliveCount = state.walls.reduce((acc, seg) => acc + (seg.isDead ? 0 : 1), 0);
        if (state.walls !== this.lastWalls || aliveCount !== this.lastAliveCount || this.sharedEdgesDirty) {
            this.lastWalls = state.walls;
            this.lastAliveCount = aliveCount;
            this.sharedEdgesDirty = false;
            this.rebuildSharedEdges(state);
        }

        const theme = state.wallTheme;
        const baseR = theme ? theme.r : 0;
        const baseG = theme ? theme.g : 188;
        const baseB = theme ? theme.b : 212;

        const sortedWalls = [...state.walls].sort((a, b) => {
            const distA = Math.hypot(a.x - px, a.y - py);
            const distB = Math.hypot(b.x - px, b.y - py);
            return distB - distA;
        });

        for (const seg of sortedWalls) {
            if (seg.isDead) continue;
            const dist = Math.hypot(seg.x - px, seg.y - py);
            if (dist > maxDist) continue;

            const healthRatio = Math.max(0, Math.round((seg.health / seg.maxHealth) * 10) / 10);
            const r = Math.floor(baseR + (244 - baseR) * (1 - healthRatio));
            const g = Math.floor(baseG + (67 - baseG) * (1 - healthRatio));
            const b = Math.floor(baseB + (54 - baseB) * (1 - healthRatio));
            const wallColor = `rgb(${Math.floor(r * 0.5)}, ${Math.floor(g * 0.5)}, ${Math.floor(b * 0.5)})`;

            const cos = Math.cos(seg.angle);
            const sin = Math.sin(seg.angle);
            const hs = seg.size / 2;
            const corners = [
                { x: seg.x + -hs * cos - -hs * sin, y: seg.y + -hs * sin + -hs * cos },
                { x: seg.x + hs * cos - -hs * sin, y: seg.y + hs * sin + -hs * cos },
                { x: seg.x + hs * cos - hs * sin, y: seg.y + hs * sin + hs * cos },
                { x: seg.x + -hs * cos - hs * sin, y: seg.y + -hs * sin + hs * cos },
            ];
            const edges = [
                [corners[0], corners[1]],
                [corners[1], corners[2]],
                [corners[2], corners[3]],
                [corners[3], corners[0]],
            ];

            if (!seg.sharedEdges) {
                seg.sharedEdges = [false, false, false, false];
            }

            for (let i = 0; i < 4; i++) {
                if (seg.sharedEdges[i]) continue;

                const p1 = edges[i][0];
                const p2 = edges[i][1];
                const edgeCx = (p1.x + p2.x) / 2;
                const edgeCy = (p1.y + p2.y) / 2;
                const outX = edgeCx - seg.x;
                const outY = edgeCy - seg.y;

                const viewX = edgeCx - px;
                const viewY = edgeCy - py;
                if (outX * viewX + outY * viewY >= 0) continue;

                let angle1 = Math.atan2(p1.y - py, p1.x - px);
                let angle2 = Math.atan2(p2.y - py, p2.x - px);
                const cross = (p1.x - px) * (p2.y - py) - (p1.y - py) * (p2.x - px);
                const spread = 0.002;
                if (cross > 0) {
                    angle1 -= spread;
                    angle2 += spread;
                } else {
                    angle1 += spread;
                    angle2 -= spread;
                }
                const proj1 = { x: p1.x + Math.cos(angle1) * 3000, y: p1.y + Math.sin(angle1) * 3000 };
                const proj2 = { x: p2.x + Math.cos(angle2) * 3000, y: p2.y + Math.sin(angle2) * 3000 };
                
                targetCtx.fillStyle = wallColor;
                targetCtx.beginPath();
                targetCtx.moveTo(p1.x, p1.y);
                targetCtx.lineTo(proj1.x, proj1.y);
                targetCtx.lineTo(proj2.x, proj2.y);
                targetCtx.lineTo(p2.x, p2.y);
                targetCtx.closePath();
                targetCtx.fill();
            }
        }
    }

    rebuildSharedEdges(state) {
        const activeWalls = [];
        for (const seg of state.walls) {
            if (seg.isDead) continue;
            seg.sharedEdges = [false, false, false, false];
            const cos = Math.cos(seg.angle);
            const sin = Math.sin(seg.angle);
            const hs = seg.size / 2;
            const corners = [
                { x: seg.x + -hs * cos - -hs * sin, y: seg.y + -hs * sin + -hs * cos },
                { x: seg.x + hs * cos - -hs * sin, y: seg.y + hs * sin + -hs * cos },
                { x: seg.x + hs * cos - hs * sin, y: seg.y + hs * sin + hs * cos },
                { x: seg.x + -hs * cos - hs * sin, y: seg.y + -hs * sin + hs * cos },
            ];
            const edges = [
                [corners[0], corners[1]],
                [corners[1], corners[2]],
                [corners[2], corners[3]],
                [corners[3], corners[0]],
            ];
            const segmentEdges = [];
            for (let i = 0; i < 4; i++) {
                const p1 = edges[i][0];
                const p2 = edges[i][1];
                const edgeCx = (p1.x + p2.x) / 2;
                const edgeCy = (p1.y + p2.y) / 2;
                segmentEdges.push({
                    p1, p2,
                    cx: edgeCx, cy: edgeCy,
                    outX: edgeCx - seg.x, outY: edgeCy - seg.y,
                    seg,
                    edgeIndex: i
                });
            }
            activeWalls.push({ seg, edges: segmentEdges });
        }

        const grid = new Map();
        const cellSize = 5;
        const getBucketKey = (x, y) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;

        for (const w of activeWalls) {
            for (const edge of w.edges) {
                const key = getBucketKey(edge.cx, edge.cy);
                if (!grid.has(key)) grid.set(key, []);
                grid.get(key).push(edge);
            }
        }

        const threshold = 3.0;
        for (const w1 of activeWalls) {
            for (const e1 of w1.edges) {
                if (e1.seg.sharedEdges[e1.edgeIndex]) continue;
                const col = Math.floor(e1.cx / cellSize);
                const row = Math.floor(e1.cy / cellSize);
                let found = false;
                for (let r = -1; r <= 1 && !found; r++) {
                    for (let c = -1; c <= 1 && !found; c++) {
                        const key = `${col + c},${row + r}`;
                        const bucket = grid.get(key);
                        if (!bucket) continue;
                        for (const e2 of bucket) {
                            if (e1 === e2) continue;
                            const dist = Math.hypot(e1.cx - e2.cx, e1.cy - e2.cy);
                            if (dist < threshold) {
                                e1.seg.sharedEdges[e1.edgeIndex] = true;
                                e2.seg.sharedEdges[e2.edgeIndex] = true;
                                found = true;
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    draw3DBuildings(ctx, state) {
        const px = state.planet.x;
        const py = state.planet.y;

        const aliveCount = state.walls.reduce((acc, seg) => acc + (seg.isDead ? 0 : 1), 0);
        if (state.walls !== this.lastWalls || aliveCount !== this.lastAliveCount || this.sharedEdgesDirty) {
            this.lastWalls = state.walls;
            this.lastAliveCount = aliveCount;
            this.sharedEdgesDirty = false;
            this.rebuildSharedEdges(state);
        }

        ctx.save();

        const sortedWalls = [...state.walls].sort((a, b) => {
            const distA = Math.hypot(a.x - px, a.y - py);
            const distB = Math.hypot(b.x - px, b.y - py);
            return distB - distA;
        });

        const theme = state.wallTheme;
        const baseR = theme ? theme.r : 0;
        const baseG = theme ? theme.g : 188;
        const baseB = theme ? theme.b : 212;

        for (const seg of sortedWalls) {
            if (seg.isDead) continue;
            const dist = Math.hypot(seg.x - px, seg.y - py);
            if (dist > 1500) continue;

            const cos = Math.cos(seg.angle);
            const sin = Math.sin(seg.angle);
            const hs = seg.size / 2;
            const corners = [
                { x: seg.x + -hs * cos - -hs * sin, y: seg.y + -hs * sin + -hs * cos },
                { x: seg.x + hs * cos - -hs * sin, y: seg.y + hs * sin + -hs * cos },
                { x: seg.x + hs * cos - hs * sin, y: seg.y + hs * sin + hs * cos },
                { x: seg.x + -hs * cos - hs * sin, y: seg.y + -hs * sin + hs * cos },
            ];
            const edges = [
                [corners[0], corners[1]],
                [corners[1], corners[2]],
                [corners[2], corners[3]],
                [corners[3], corners[0]],
            ];

            if (!seg.sharedEdges) {
                seg.sharedEdges = [false, false, false, false];
            }

            const healthRatio = Math.max(0, Math.round((seg.health / seg.maxHealth) * 10) / 10);
            const r = Math.floor(baseR + (244 - baseR) * (1 - healthRatio));
            const g = Math.floor(baseG + (67 - baseG) * (1 - healthRatio));
            const b = Math.floor(baseB + (54 - baseB) * (1 - healthRatio));
            const wallColor = `rgb(${r}, ${g}, ${b})`;

            ctx.fillStyle = wallColor;

            for (let i = 0; i < 4; i++) {
                if (seg.sharedEdges[i]) continue;

                const p1 = edges[i][0];
                const p2 = edges[i][1];
                const edgeCx = (p1.x + p2.x) / 2;
                const edgeCy = (p1.y + p2.y) / 2;
                const outX = edgeCx - seg.x;
                const outY = edgeCy - seg.y;

                const viewX = edgeCx - px;
                const viewY = edgeCy - py;
                if (outX * viewX + outY * viewY >= 0) continue;

                let angle1 = Math.atan2(p1.y - py, p1.x - px);
                let angle2 = Math.atan2(p2.y - py, p2.x - px);
                const cross = (p1.x - px) * (p2.y - py) - (p1.y - py) * (p2.x - px);
                const spread = 0.002;
                if (cross > 0) {
                    angle1 -= spread;
                    angle2 += spread;
                } else {
                    angle1 += spread;
                    angle2 -= spread;
                }
                const proj1 = { x: p1.x + Math.cos(angle1) * 3000, y: p1.y + Math.sin(angle1) * 3000 };
                const proj2 = { x: p2.x + Math.cos(angle2) * 3000, y: p2.y + Math.sin(angle2) * 3000 };
                
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(proj1.x, proj1.y);
                ctx.lineTo(proj2.x, proj2.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
        }

        const weaponRange = state.weapon.range;
        if (weaponRange > 0) {
            ctx.fillStyle = "#000000";
            ctx.beginPath();
            ctx.rect(state.planet.x - 10000, state.planet.y - 10000, 20000, 20000);
            ctx.arc(state.planet.x, state.planet.y, weaponRange, 0, Math.PI * 2);
            ctx.fill("evenodd");
        }

        ctx.restore();
    }
}
