export class Render3D {
    constructor() {
        this.lastWalls = null;
        this.lastAliveCount = 0;
        this.sharedEdgesDirty = true;
    }

    getSegmentEdges(seg) {
        if (!seg.edges) {
            const cos = Math.cos(seg.angle);
            const sin = Math.sin(seg.angle);
            const hs = seg.size / 2;
            const corners = [
                { x: seg.x + -hs * cos - -hs * sin, y: seg.y + -hs * sin + -hs * cos },
                { x: seg.x + hs * cos - -hs * sin, y: seg.y + hs * sin + -hs * cos },
                { x: seg.x + hs * cos - hs * sin, y: seg.y + hs * sin + hs * cos },
                { x: seg.x + -hs * cos - hs * sin, y: seg.y + -hs * sin + hs * cos },
            ];
            seg.edges = [
                [corners[0], corners[1]],
                [corners[1], corners[2]],
                [corners[2], corners[3]],
                [corners[3], corners[0]],
            ];
        }
        return seg.edges;
    }

    updateSharedEdges(state) {
        const aliveCount = state.walls.reduce((acc, seg) => acc + (seg.isDead ? 0 : 1), 0);
        if (state.walls !== this.lastWalls || aliveCount !== this.lastAliveCount || this.sharedEdgesDirty) {
            this.lastWalls = state.walls;
            this.lastAliveCount = aliveCount;
            this.sharedEdgesDirty = false;
            this.rebuildSharedEdges(state);
        }
    }

    getWallColor(seg, theme, darkenRatio = 1.0) {
        const baseR = theme ? theme.r : 0;
        const baseG = theme ? theme.g : 188;
        const baseB = theme ? theme.b : 212;
        const healthRatio = Math.max(0, Math.round((seg.health / seg.maxHealth) * 10) / 10);
        const r = Math.floor((baseR + (244 - baseR) * (1 - healthRatio)) * darkenRatio);
        const g = Math.floor((baseG + (67 - baseG) * (1 - healthRatio)) * darkenRatio);
        const b = Math.floor((baseB + (54 - baseB) * (1 - healthRatio)) * darkenRatio);
        return { r, g, b };
    }

    getWallColorStr(seg, theme, darkenRatio = 1.0) {
        const c = this.getWallColor(seg, theme, darkenRatio);
        return `rgb(${c.r}, ${c.g}, ${c.b})`;
    }

    /**
     * Draw a side face of a wall segment extruded outward from the planet center
     * by the segment's height. p1 and p2 are the base edge corners.
     */
    drawExtrudedFace(ctx, p1, p2, px, py, height, fillStyle, strokeStyle) {
        // Direction from planet center to the midpoint of this edge
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const dirX = midX - px;
        const dirY = midY - py;
        const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);

        if (dirLen === 0) return;

        // Normalized extrusion direction
        const nx = dirX / dirLen;
        const ny = dirY / dirLen;

        // Extrude each corner outward by height
        const extP1 = { x: p1.x + nx * height, y: p1.y + ny * height };
        const extP2 = { x: p2.x + nx * height, y: p2.y + ny * height };

        ctx.fillStyle = fillStyle;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(extP2.x, extP2.y);
        ctx.lineTo(extP1.x, extP1.y);
        ctx.closePath();
        ctx.fill();
        if (strokeStyle) {
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    }

    /**
     * Draw the top face of a wall segment (the extruded cap).
     */
    drawTopFace(ctx, seg, px, py, fillStyle, strokeStyle) {
        const edges = this.getSegmentEdges(seg);
        const height = seg.height || seg.size;

        // For each corner of the base, extrude outward from planet center
        const corners = [
            edges[0][0], // corner 0
            edges[0][1], // corner 1
            edges[1][1], // corner 2
            edges[2][1], // corner 3
        ];

        // Compute per-corner extrusion direction from planet center
        const extCorners = corners.map(c => {
            const dx = c.x - px;
            const dy = c.y - py;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len === 0) return { x: c.x, y: c.y };
            return {
                x: c.x + (dx / len) * height,
                y: c.y + (dy / len) * height
            };
        });

        ctx.fillStyle = fillStyle;
        ctx.beginPath();
        ctx.moveTo(extCorners[0].x, extCorners[0].y);
        ctx.lineTo(extCorners[1].x, extCorners[1].y);
        ctx.lineTo(extCorners[2].x, extCorners[2].y);
        ctx.lineTo(extCorners[3].x, extCorners[3].y);
        ctx.closePath();
        ctx.fill();
        if (strokeStyle) {
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    }

    drawProjectedFace(ctx, p1, p2, px, py, fillStyle, shouldStroke = false) {
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
        const proj1X = p1.x + Math.cos(angle1) * 3000;
        const proj1Y = p1.y + Math.sin(angle1) * 3000;
        const proj2X = p2.x + Math.cos(angle2) * 3000;
        const proj2Y = p2.y + Math.sin(angle2) * 3000;
        
        ctx.fillStyle = fillStyle;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(proj1X, proj1Y);
        ctx.lineTo(proj2X, proj2Y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fill();
        if (shouldStroke) {
            ctx.stroke();
        }
    }

    drawExplosion(px, py, maxDist, state, targetCtx) {
        this.updateSharedEdges(state);

        const maxDistSq = maxDist * maxDist;
        const visibleWalls = [];
        for (let i = 0; i < state.walls.length; i++) {
            const seg = state.walls[i];
            if (seg.isDead) continue;
            const distSq = (seg.x - px) ** 2 + (seg.y - py) ** 2;
            if (distSq <= maxDistSq) {
                seg._distSq = distSq;
                visibleWalls.push(seg);
            }
        }
        visibleWalls.sort((a, b) => b._distSq - a._distSq);

        for (const seg of visibleWalls) {

            const wallColor = this.getWallColorStr(seg, state.wallTheme, 0.5);
            const edges = this.getSegmentEdges(seg);

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

                this.drawProjectedFace(targetCtx, p1, p2, px, py, wallColor, false);
            }
        }
    }

    rebuildSharedEdges(state) {
        const activeWalls = [];
        for (const seg of state.walls) {
            if (seg.isDead) continue;
            seg.sharedEdges = [false, false, false, false];
            const edges = this.getSegmentEdges(seg);
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

        const thresholdSq = 9.0;
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
                            const distSq = (e1.cx - e2.cx) ** 2 + (e1.cy - e2.cy) ** 2;
                            if (distSq < thresholdSq) {
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

    draw3DBuildings(ctx, state, viewport) {
        const px = state.planet.x;
        const py = state.planet.y;

        this.updateSharedEdges(state);

        ctx.save();

        const visibleWalls = [];
        for (let i = 0; i < state.walls.length; i++) {
            const seg = state.walls[i];
            if (seg.isDead) continue;
            const distSq = (seg.x - px) ** 2 + (seg.y - py) ** 2;
            if (distSq <= 2250000) {
                seg._distSq = distSq;
                visibleWalls.push(seg);
            }
        }
        visibleWalls.sort((a, b) => b._distSq - a._distSq);

        for (const seg of visibleWalls) {
            const wallColorObj = this.getWallColor(seg, state.wallTheme, 1.0);
            const sideColor = `rgb(${Math.floor(wallColorObj.r * 0.65)}, ${Math.floor(wallColorObj.g * 0.65)}, ${Math.floor(wallColorObj.b * 0.65)})`;
            const topColor = `rgb(${wallColorObj.r}, ${wallColorObj.g}, ${wallColorObj.b})`;
            const strokeColor = `rgba(0, 0, 0, 0.3)`;
            const edges = this.getSegmentEdges(seg);
            const height = seg.height || seg.size;

            if (!seg.sharedEdges) {
                seg.sharedEdges = [false, false, false, false];
            }

            // Draw visible side faces (edges facing away from planet)
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
                // Only draw faces pointing away from the planet (outer faces)
                if (outX * viewX + outY * viewY >= 0) continue;

                this.drawExtrudedFace(ctx, p1, p2, px, py, height, sideColor, strokeColor);
            }

            // Draw the top face
            this.drawTopFace(ctx, seg, px, py, topColor, strokeColor);
        }

        const weaponRange = state.weapon.range;
        if (weaponRange > 0) {
            const maskRadius = (viewport && state.phase === "combat") ? (viewport.getVisualRadius() / viewport.zoom) : weaponRange;
            ctx.fillStyle = "#000000";
            ctx.beginPath();
            ctx.rect(state.planet.x - 10000, state.planet.y - 10000, 20000, 20000);
            ctx.arc(state.planet.x, state.planet.y, maskRadius, 0, Math.PI * 2);
            ctx.fill("evenodd");
        }

        ctx.restore();
    }
}
